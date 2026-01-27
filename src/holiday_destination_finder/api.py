from datetime import date
from typing import List, Optional
import json
import threading
import os
import re
import logging
import time
import base64
import urllib.request
import urllib.parse
import redis

from fastapi import FastAPI, Query, HTTPException, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from .kv_queue import enqueue, get_job, get_queue_position, cancel_job
from .worker import main as worker_main  # your existing worker loop
from .config import setup_logging

# Initialize logging on module load
setup_logging()
import logging
logger = logging.getLogger(__name__)

# Import Supabase functions (optional - will fail gracefully if not configured)
try:
    from .supabase import (
        get_search_result,
        touch_search_result,
        get_search_results_by_client,
        get_saved_searches_by_client,
        save_search_for_client,
        unsave_search_for_client,
        is_search_saved,
        update_search_name,
    )
except ImportError:
    get_search_result = None
    touch_search_result = None
    get_search_results_by_client = None
    get_saved_searches_by_client = None
    save_search_for_client = None
    unsave_search_for_client = None
    is_search_saved = None
    update_search_name = None
    logger.warning("[api] Supabase module not available")

# Redis connection for rate limiting
_redis = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

# API Key configuration
_API_KEY = os.environ.get("API_KEY")

# Browserless.io configuration for resolving departure airports
_BROWSERLESS_API_KEY = os.environ.get("BROWSERLESS_API_KEY")
_BROWSERLESS_ENDPOINT = "https://production-sfo.browserless.io/function"

# Rate limiting configuration
RATE_LIMIT_REQUESTS = 30  # requests per window
RATE_LIMIT_WINDOW_SECONDS = 3600  # 1 hour


def _get_client_ip(request: Request) -> str:
    """Extract client IP, considering proxy headers."""
    # Check for forwarded header (common with reverse proxies like Render)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Take the first IP in the chain (original client)
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    """
    Dependency to verify API key.
    If API_KEY env var is not set, authentication is disabled (development mode).
    """
    if not _API_KEY:
        # No API key configured - allow all requests (dev mode)
        logger.debug("[api] No API_KEY configured, skipping authentication")
        return

    if not x_api_key:
        logger.warning("[api] Request missing API key")
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Include 'X-API-Key' header."
        )

    if x_api_key != _API_KEY:
        logger.warning("[api] Invalid API key provided")
        raise HTTPException(
            status_code=401,
            detail="Invalid API key."
        )


def check_rate_limit(request: Request) -> None:
    """
    Dependency to enforce rate limiting per IP address.
    Uses Redis to track request counts with a sliding window.
    """
    client_ip = _get_client_ip(request)
    rate_key = f"rate_limit:{client_ip}"

    try:
        current_count = _redis.get(rate_key)

        if current_count is None:
            # First request in this window
            _redis.setex(rate_key, RATE_LIMIT_WINDOW_SECONDS, 1)
        else:
            count = int(current_count)
            if count >= RATE_LIMIT_REQUESTS:
                ttl = _redis.ttl(rate_key)
                logger.warning(f"[api] Rate limit exceeded for IP {client_ip}")
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Maximum {RATE_LIMIT_REQUESTS} requests per hour. Try again in {ttl} seconds."
                )
            # Increment counter
            _redis.incr(rate_key)
    except redis.RedisError as e:
        # If Redis fails, log but allow the request (fail open)
        logger.error(f"[api] Redis error during rate limiting: {e}")


# Dependency for rate-limited endpoints (only /search)
async def search_endpoint(
    request: Request,
    _key: None = Depends(verify_api_key),
    _rate: None = Depends(check_rate_limit)
) -> None:
    """Dependency that checks API key AND rate limit. Use for /search only."""
    pass


# Dependency for non-rate-limited endpoints (job status, cancel)
async def authenticated_endpoint(
    _key: None = Depends(verify_api_key)
) -> None:
    """Dependency that checks API key only (no rate limit). Use for polling endpoints."""
    pass


def _get_client_id(x_client_id: Optional[str] = Header(None, alias="X-Client-ID")) -> Optional[str]:
    """
    Extract client_id from header. Returns None if not provided.
    Client ID is optional - if not provided, some features won't work (like Personal/Shared tabs).
    """
    return x_client_id

class SearchResult(BaseModel):
    city: str
    country: str
    airport: str
    avg_temp_c: float
    avg_precip_mm_per_day: float
    flight_price: float
    currency: str
    total_stops: int
    airlines: str
    best_departure: str
    best_return: str
    score: float

app = FastAPI(title="Holiday Destination Finder API")

# CORS configuration - restrict to known frontend origins
_default_origins = [
    "https://holiday-destination-finder.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
# Allow override via environment variable (comma-separated list)
_env_origins = os.getenv("CORS_ORIGINS")
_allowed_origins = _env_origins.split(",") if _env_origins else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def start_embedded_worker():
    # IMPORTANT: run uvicorn with --workers 1, otherwise you spawn multiple worker threads
    t = threading.Thread(target=worker_main, daemon=True)
    t.start()

@app.get("/health")
def health():
    return {"status": "ok"}

# Input validation helpers
_IATA_PATTERN = re.compile(r"^[A-Z]{3}$")
_VALID_PROVIDERS = {"amadeus", "ryanair", "wizzair", "serpapi"}

def _validate_origin(origin: str) -> str:
    """Validate origin - can be IATA code or kgmid (country/city)."""
    origin = origin.strip()

    # If it's a kgmid, validate format
    if origin.startswith('/'):
        if not re.match(r"^/(m|g)/[A-Za-z0-9_]+$", origin, re.IGNORECASE):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid Google ID '{origin}': must start with /m/ or /g/"
            )
        return origin

    # Otherwise treat as IATA
    origin = origin.upper()
    if not _IATA_PATTERN.match(origin):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid origin '{origin}': must be a 3-letter IATA airport code (e.g., WRO, LHR, JFK) or a Google ID (e.g., /m/05qhw)"
        )
    return origin

def _validate_origin_for_providers(origin: str, providers: List[str]) -> str:
    """Validate origin based on selected providers. All providers now support kgmid."""
    return _validate_origin(origin)

def _validate_dates(start: date, end: date, trip_length: int) -> None:
    """Validate date range and trip length compatibility."""
    if end < start:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid date range: end date ({end}) must be after start date ({start})"
        )

    date_range_days = (end - start).days
    if date_range_days < trip_length:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid date range: date range ({date_range_days} days) must be >= trip length ({trip_length} days)"
        )

def _validate_trip_length(trip_length: int) -> int:
    """Validate trip length bounds."""
    if trip_length < 1:
        raise HTTPException(status_code=422, detail="trip_length must be at least 1 day")
    if trip_length > 65:
        raise HTTPException(status_code=422, detail="trip_length cannot exceed 30 days")
    return trip_length

def _validate_providers(providers: List[str]) -> List[str]:
    """Validate and normalize provider list."""
    normalized = [p.strip().lower() for p in providers if p.strip()]
    invalid = [p for p in normalized if p not in _VALID_PROVIDERS]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid providers: {invalid}. Valid options: {sorted(_VALID_PROVIDERS)}"
        )
    if not normalized:
        raise HTTPException(status_code=422, detail="At least one provider must be specified")
    return normalized

def _validate_top_n(top_n: int) -> int:
    """Validate top_n bounds."""
    if top_n < 1:
        raise HTTPException(status_code=422, detail="top_n must be at least 1")
    if top_n > 50:
        raise HTTPException(status_code=422, detail="top_n cannot exceed 50")
    return top_n

# Start a job (return immediately) - rate limited
@app.get("/search", status_code=202, dependencies=[Depends(search_endpoint)])
def search(
    origin: str = Query("WRO"),
    start: date = Query(...),
    end: date = Query(...),
    trip_length: int = Query(7),
    providers: List[str] = Query(["ryanair", "wizzair"]),
    top_n: int = Query(10),
    client_id: Optional[str] = Depends(_get_client_id),
):
    providers = _validate_providers(providers)
    # Validate all inputs
    origin = _validate_origin_for_providers(origin, providers)
    trip_length = _validate_trip_length(trip_length)
    _validate_dates(start, end, trip_length)
    top_n = _validate_top_n(top_n)

    params = {
        "origin": origin,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "trip_length": trip_length,
        "providers": providers,
        "top_n": top_n,
    }

    # Get client_id from header (optional)
    client_id = _get_client_id()
    
    logger.info(f"[api] Creating search job: origin={origin}, {start} to {end}, trip_length={trip_length}, providers={providers}, client_id={client_id}")
    job_id = enqueue(params, client_id=client_id)
    return {"job_id": job_id}

@app.get("/jobs/{job_id}", dependencies=[Depends(authenticated_endpoint)])
def job(job_id: str):
    # Check Redis first (fast path for recently created/active jobs)
    data = get_job(job_id)
    
    # If not in Redis, check Supabase (for jobs that expired from Redis but still exist in Supabase)
    if not data and get_search_result:
        try:
            supabase_result = get_search_result(job_id, update_ttl=True)
            if supabase_result:
                # Convert Supabase format to Redis format for consistency
                data = {
                    "status": supabase_result.get("status", "done"),
                    "params": json.dumps(supabase_result.get("params", {})),
                }
                if supabase_result.get("result"):
                    data["result"] = json.dumps(supabase_result["result"]) if isinstance(supabase_result["result"], dict) else supabase_result["result"]
                if supabase_result.get("error"):
                    data["error"] = supabase_result["error"]
        except Exception as e:
            logger.error(f"[api] Error fetching from Supabase for job {job_id}: {e}")
    
    if not data:
        raise HTTPException(status_code=404, detail="Job not found (expired or restarted)")

    status = data.get("status")
    out = {"job_id": job_id, "status": status}
    
    if status == "queued":
        # Get queue position for queued jobs
        queue_position = get_queue_position(job_id)
        if queue_position is not None:
            out["queue_position"] = queue_position
        # If queue_position is None, job might have just been popped or queue is empty
        # We'll still include queue_position: null to indicate we checked
    
    if status in ("queued", "running"):
        if "processed" in data and "total" in data:
            try:
                out["processed"] = int(data["processed"])
                out["total"] = int(data["total"])
            except ValueError:
                out["processed"] = data["processed"]
                out["total"] = data["total"]

        if "current" in data:
            out["current"] = data["current"]

        # Multi-airport origin progress
        if "origin_airport" in data:
            out["origin_airport"] = data["origin_airport"]
        if "origin_airport_idx" in data and "origin_airport_total" in data:
            try:
                out["origin_airport_idx"] = int(data["origin_airport_idx"])
                out["origin_airport_total"] = int(data["origin_airport_total"])
            except ValueError:
                pass

    if "result" in data:
        out["payload"] = json.loads(data["result"])
    if "error" in data:
        out["error"] = data["error"]
    
    return out

@app.post("/jobs/{job_id}/cancel", dependencies=[Depends(authenticated_endpoint)])
def cancel(job_id: str):
    success = cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or cannot be cancelled")
    return {"status": "cancelled", "job_id": job_id}


# New endpoints for Supabase-backed features

@app.get("/jobs", dependencies=[Depends(authenticated_endpoint)])
def get_jobs(
    client_id: Optional[str] = Depends(_get_client_id),
    type: str = Query("personal", description="Type of jobs to fetch: 'personal' or 'shared'")
):
    """
    Get jobs for a client_id from Supabase.
    This endpoint queries Supabase ONLY (not Redis) for sidebar persistence.
    """
    if not client_id:
        return []
    
    if not get_search_results_by_client or not get_saved_searches_by_client:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    
    try:
        if type == "shared":
            results = get_saved_searches_by_client(client_id)
        else:  # type == "personal"
            results = get_search_results_by_client(client_id)
        
        # Convert to API format
        jobs = []
        for result in results:
            job = {
                "job_id": result["job_id"],
                "status": result["status"],
                "params": result.get("params", {}),
            }
            if result.get("result"):
                job["payload"] = result["result"]
            if result.get("error"):
                job["error"] = result["error"]
            if result.get("custom_name"):
                job["custom_name"] = result["custom_name"]
            jobs.append(job)
        
        return jobs
    except Exception as e:
        logger.error(f"[api] Error fetching jobs for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch jobs: {str(e)}")


@app.post("/jobs/{job_id}/save", dependencies=[Depends(authenticated_endpoint)])
def save_job(
    job_id: str,
    client_id: Optional[str] = Depends(_get_client_id)
):
    """Save a shared search to user's saved list."""
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header is required")
    
    if not save_search_for_client:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    
    success = save_search_for_client(client_id, job_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save search")
    
    return {"status": "saved", "job_id": job_id}


@app.post("/jobs/{job_id}/unsave", dependencies=[Depends(authenticated_endpoint)])
def unsave_job(
    job_id: str,
    client_id: Optional[str] = Depends(_get_client_id)
):
    """Remove a search from user's saved list."""
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header is required")
    
    if not unsave_search_for_client:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    
    success = unsave_search_for_client(client_id, job_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to unsave search")
    
    return {"status": "unsaved", "job_id": job_id}


@app.get("/jobs/{job_id}/saved", dependencies=[Depends(authenticated_endpoint)])
def check_saved(
    job_id: str,
    client_id: Optional[str] = Depends(_get_client_id)
):
    """Check if a search is saved by the current user."""
    if not client_id:
        return {"saved": False}
    
    if not is_search_saved:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    
    saved = is_search_saved(client_id, job_id)
    return {"saved": saved}


class RenameRequest(BaseModel):
    custom_name: Optional[str] = None


@app.put("/jobs/{job_id}/name", dependencies=[Depends(authenticated_endpoint)])
def rename_job(
    job_id: str,
    request: RenameRequest,
    client_id: Optional[str] = Depends(_get_client_id)
):
    """Rename a search (only if client_id matches the search's creator)."""
    if not client_id:
        raise HTTPException(status_code=400, detail="X-Client-ID header is required")
    
    if not update_search_name:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    
    success = update_search_name(job_id, client_id, request.custom_name)
    if not success:
        raise HTTPException(status_code=403, detail="You can only rename your own searches")
    
    return {"status": "updated", "job_id": job_id, "custom_name": request.custom_name}


# ============================================================================
# Google Flights URL builder and Browserless.io integration
# ============================================================================

def _encode_varint(n: int) -> bytes:
    """Encode an integer as a protobuf varint."""
    result = []
    while n > 127:
        result.append((n & 0x7f) | 0x80)
        n >>= 7
    result.append(n)
    return bytes(result)


def _encode_string(field_num: int, s: str) -> bytes:
    """Encode a string as a protobuf field."""
    encoded = s.encode('utf-8')
    return bytes([field_num << 3 | 2]) + _encode_varint(len(encoded)) + encoded


def _encode_location(field_num: int, loc_type: int, kgmid_or_iata: str) -> bytes:
    """Encode a location (airport/city/country) as protobuf."""
    inner = bytes([0x08, loc_type]) + _encode_string(2, kgmid_or_iata)
    return bytes([field_num << 3 | 2]) + _encode_varint(len(inner)) + inner


def _encode_leg(date_str: str, origin_type: int, origin: str, dest_type: int, dest: str) -> bytes:
    """Encode a flight leg (outbound or return) as protobuf."""
    inner = _encode_string(2, date_str) + _encode_location(13, origin_type, origin) + _encode_location(14, dest_type, dest)
    return bytes([0x1a]) + _encode_varint(len(inner)) + inner


def _get_location_type(location: str) -> int:
    """
    Determine the protobuf location type:
    - 1 = IATA airport code
    - 2 = country kgmid
    - 3 = city kgmid
    """
    if location.startswith('/m/') or location.startswith('/g/'):
        # Heuristic: country kgmids are typically shorter
        # This is a simplification - in practice we'd need a lookup
        # For now, treat all kgmids as type 2 (country) for origin, type 3 for cities
        return 2  # Will be overridden by caller if needed
    return 1  # IATA code


def build_google_flights_tfs(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: str,
    origin_type: int = None,
    dest_type: int = None
) -> str:
    """
    Build a Google Flights tfs parameter (base64-encoded protobuf).

    Args:
        origin: IATA code or kgmid (e.g., 'KRK' or '/m/05qhw')
        destination: IATA code or kgmid
        departure_date: YYYY-MM-DD format
        return_date: YYYY-MM-DD format
        origin_type: Override location type (1=IATA, 2=country, 3=city)
        dest_type: Override location type for destination

    Returns:
        URL-safe base64 encoded tfs parameter
    """
    # Determine types if not provided
    if origin_type is None:
        origin_type = 2 if origin.startswith('/') else 1
    if dest_type is None:
        dest_type = 3 if destination.startswith('/') else 1

    # Build protobuf
    tfs = bytes([0x08, 0x1b, 0x10, 0x02])  # header

    # Outbound leg
    tfs += _encode_leg(departure_date, origin_type, origin, dest_type, destination)

    # Return leg (swap origin and destination)
    tfs += _encode_leg(return_date, dest_type, destination, origin_type, origin)

    # Footer
    tfs += bytes([0x40, 0x01, 0x48, 0x01])
    tfs += _encode_string(10, "EUR")
    tfs += bytes([0x70, 0x01])

    # Base64 encode (URL-safe, no padding)
    return base64.urlsafe_b64encode(tfs).decode('utf-8').rstrip('=')


def build_google_flights_url(origin: str, destination: str, departure_date: str, return_date: str) -> str:
    """Build a complete Google Flights URL."""
    tfs = build_google_flights_tfs(origin, destination, departure_date, return_date)
    return f"https://www.google.com/travel/flights?hl=en&gl=us&curr=EUR&tfs={tfs}"


# Puppeteer code to extract the cheapest departure airport from Google Flights
_BROWSERLESS_FUNCTION_CODE = '''
export default async function ({ page, context }) {
    const { url, timeout = 25000, debug = false } = context;

    try {
        // Navigate to Google Flights
        await page.goto(url, { waitUntil: 'networkidle2', timeout });

        // Wait for dynamic content to load - flight prices take time
        await new Promise(r => setTimeout(r, 5000));

        // Try to bring "Top departing flights" into view to force render
        await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('div, span'));
            const target = candidates.find(el => (el.textContent || '').includes('Top departing flights'));
            if (target && target.scrollIntoView) {
                target.scrollIntoView({ block: 'center' });
            } else {
                window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.5));
            }
        });

        await new Promise(r => setTimeout(r, 2000));

        // Look for the "Fly from" / "cheaper from" notification or extract the displayed origin
        const result = await page.evaluate((destination) => {
            const bodyText = document.body.innerText;
            const dest = (destination || '').toUpperCase();

            const collectCandidateTexts = () => {
                const nodes = [
                    ...document.querySelectorAll('[role="status"], [role="alert"], [aria-live], [role="tooltip"], [aria-label], [title]')
                ];
                return nodes
                    .map(el => el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
                    .filter(Boolean);
            };

            // Strategy 1: Look for "Fly from XXX for €YY" notification/banner
            // This appears when Google suggests a cheaper departure airport
            const notificationTextCandidates = collectCandidateTexts();
            const notificationText = notificationTextCandidates.join(' ');

            const flyFromPatterns = [
                /Fly from\\s+([A-Z]{3})\\s+for\\s+([€$£]?\\s*\\d+|\\d+\\s*[€$£])/i,
                /\\bfrom\\s+([A-Z]{3})\\s+for\\s+([€$£]?\\s*\\d+|\\d+\\s*[€$£])/i,
            ];

            for (const pattern of flyFromPatterns) {
                const match = notificationText.match(pattern) || bodyText.match(pattern);
                if (match) {
                    return { airport: match[1], source: 'fly_from_notification' };
                }
            }

            // Strategy 1b: Look for explicit data-iata-code on "Change airport" CTA
            const changeAirportIata = document.querySelector('[data-is-origin="true"][data-iata-code]') ||
                document.querySelector('[data-iata-code]');
            if (changeAirportIata) {
                const iata = changeAirportIata.getAttribute('data-iata-code');
                if (iata && /^[A-Z]{3}$/.test(iata)) {
                    return { airport: iata, source: 'change_airport_data' };
                }
            }

            // Strategy 2: Look for "cheaper from XXX" notification/banner
            const cheaperPatterns = [
                /(?:from|From)\\s+([A-Z]{3})\\s+(?:is|are|would be)\\s+cheaper/i,
                /[Ff]lights?\\s+from\\s+([A-Z]{3})\\s+are\\s+[€$£]?\\d+\\s+cheaper/i,
                /[Cc]heaper\\s+from\\s+([A-Z]{3})/i,
                /[Ss]ave\\s+[€$£]?\\d+.*?from\\s+([A-Z]{3})/i
            ];

            for (const pattern of cheaperPatterns) {
                const match = bodyText.match(pattern);
                if (match) {
                    return { airport: match[1], source: 'cheaper_suggestion' };
                }
            }

            // Strategy 3: Look for the origin airport in the search form
            // The input field shows the currently selected origin
            const originInputs = document.querySelectorAll('input[placeholder*="Where from"], input[aria-label*="Where from"], input[aria-label*="origin" i], input[aria-label*="departure" i]');
            for (const input of originInputs) {
                const text = input.value || input.textContent || '';
                const iataMatch = text.match(/\\b([A-Z]{3})\\b/);
                if (iataMatch) {
                    return { airport: iataMatch[1], source: 'origin_input' };
                }
            }

            // Strategy 4: Look for departure airport in displayed flight cards
            // Flight cards show "WAW – VLC" or "WAW-VLC" format
            const flightRoutePattern = /\\b([A-Z]{3})\\s*[–—-]\\s*([A-Z]{3})\\b/;
            const candidateTexts = collectCandidateTexts().concat([bodyText]);
            const routeCandidates = [];
            for (const text of candidateTexts) {
                const match = text.match(flightRoutePattern);
                if (match) {
                    routeCandidates.push(match);
                }
            }
            if (routeCandidates.length > 0) {
                return { airport: routeCandidates[0][1], source: 'flight_route' };
            }

            // Strategy 5: Look near "Change airport" tooltip text
            const changeAirportNodes = Array.from(document.querySelectorAll('*'))
                .filter(el => (el.textContent || '').includes('Change airport'))
                .slice(0, 5);

            for (const node of changeAirportNodes) {
                const text = node.textContent || '';
                const match = text.match(/\\bfrom\\s+([A-Z]{3})\\b/i);
                if (match) {
                    return { airport: match[1], source: 'change_airport_tooltip' };
                }
            }

            // Strategy 6: Scan script payloads for origin/destination pairs
            if (dest) {
                const scriptTexts = Array.from(document.querySelectorAll('script'))
                    .map(script => script.textContent || '')
                    .filter(Boolean);
                const pairPattern = new RegExp(`\\b([A-Z]{3})\\b[^A-Z]{0,40}\\b${dest}\\b`);
                for (const text of scriptTexts) {
                    const match = text.match(pairPattern);
                    if (match) {
                        return { airport: match[1], source: 'script_pair' };
                    }
                }
            }

            return null;
        }, context.destination);

        if (!result && debug) {
            const debugInfo = await page.evaluate(() => {
                const limitText = (text, max = 2000) => {
                    if (!text) return text;
                    return text.length > max ? text.slice(0, max) + '…' : text;
                };

                const candidates = Array.from(
                    document.querySelectorAll('[role="status"], [role="alert"], [aria-live], [role="tooltip"], [aria-label], [title]')
                )
                    .map(el => el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
                    .filter(Boolean);

                const interesting = candidates.filter(text =>
                    /(Fly from|cheaper from|from\\s+[A-Z]{3}|Change airport)/i.test(text)
                );

                const dataIataElements = Array.from(document.querySelectorAll('[data-iata-code]'))
                    .map(el => ({
                        iata: el.getAttribute('data-iata-code'),
                        is_origin: el.getAttribute('data-is-origin'),
                        text: (el.textContent || '').trim()
                    }))
                    .slice(0, 10);

                const originInputs = Array.from(
                    document.querySelectorAll('input[placeholder*="Where from"], input[aria-label*="Where from"], input[aria-label*="origin" i], input[aria-label*="departure" i]')
                )
                    .map(input => input.value || input.textContent || '')
                    .filter(Boolean);

                const bodyText = document.body.innerText || '';
                const routeMatches = [...bodyText.matchAll(/\\b([A-Z]{3})\\s*[–—-]\\s*[A-Z]{3}\\b/g)]
                    .slice(0, 3)
                    .map(match => match[0]);

                const changeAirportNode = Array.from(document.querySelectorAll('*'))
                    .find(el => (el.textContent || '').includes('Change airport'));

                const topDepartingNode = Array.from(document.querySelectorAll('*'))
                    .find(el => (el.textContent || '').includes('Top departing flights'));

                return {
                    candidate_snippets: interesting.slice(0, 8),
                    data_iata_elements: dataIataElements,
                    origin_inputs: originInputs.slice(0, 5),
                    route_matches: routeMatches,
                    change_airport_html: changeAirportNode ? limitText(changeAirportNode.outerHTML) : null,
                    top_departing_html: topDepartingNode ? limitText(topDepartingNode.outerHTML) : null,
                };
            });

            return {
                data: { airport: null, error: 'No airport match found', debug: debugInfo },
                type: 'application/json'
            };
        }

        if (result) {
            return { data: result, type: 'application/json' };
        }

        // No airport found
        return {
            data: { airport: null, error: 'Could not find departure airport in page' },
            type: 'application/json'
        };

    } catch (error) {
        return {
            data: { airport: null, error: error.message },
            type: 'application/json'
        };
    }
}
'''


def resolve_departure_airport_detail(
    origin_kgmid: str,
    destination: str,
    departure_date: str,
    return_date: str,
    timeout_ms: int = 20000,
    debug: bool = False
) -> dict:
    """
    Use Browserless.io to render Google Flights and find the cheapest departure airport.

    Args:
        origin_kgmid: Country or city kgmid (e.g., '/m/05qhw' for Poland)
        destination: Destination IATA code (e.g., 'VLC')
        departure_date: YYYY-MM-DD
        return_date: YYYY-MM-DD
        timeout_ms: Timeout for the browser operation

    Returns:
        Dict with airport/source/debug info from Browserless.
    """
    if not _BROWSERLESS_API_KEY:
        logger.warning("[api] BROWSERLESS_API_KEY not configured")
        return {"airport": None, "error": "BROWSERLESS_API_KEY not configured"}

    # Build the Google Flights URL
    gf_url = build_google_flights_url(origin_kgmid, destination, departure_date, return_date)
    logger.info(f"[api] Resolving departure airport from {origin_kgmid} to {destination}")
    logger.debug(f"[api] Google Flights URL: {gf_url}")

    # Prepare the Browserless.io request
    payload = {
        "code": _BROWSERLESS_FUNCTION_CODE,
        "context": {
            "url": gf_url,
            "timeout": timeout_ms,
            "debug": debug,
            "destination": destination
        }
    }

    browserless_url = f"{_BROWSERLESS_ENDPOINT}?token={_BROWSERLESS_API_KEY}"

    last_error = None
    attempts = 2
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(
                browserless_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json'
                },
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode('utf-8'))

                if isinstance(result, dict):
                    data = result.get("data") if "data" in result else result
                    if isinstance(data, dict):
                        if data.get("airport"):
                            airport = data["airport"]
                            source = data.get("source", "unknown")
                            logger.info(f"[api] Resolved departure airport: {airport} (source: {source})")
                            return data

                        logger.warning(f"[api] Could not resolve departure airport: {data}")
                        last_error = data
                    else:
                        last_error = {"airport": None, "error": "Unexpected data format from Browserless"}
                else:
                    last_error = {"airport": None, "error": "Unexpected response from Browserless"}

        except urllib.error.HTTPError as e:
            logger.error(f"[api] Browserless.io HTTP error: {e.code} {e.reason}")
            try:
                error_body = e.read().decode('utf-8')
                logger.error(f"[api] Error details: {error_body[:500]}")
            except Exception:
                pass
            last_error = {"airport": None, "error": f"Browserless.io HTTP error: {e.code} {e.reason}"}
        except Exception as e:
            logger.error(f"[api] Error calling Browserless.io: {e}")
            last_error = {"airport": None, "error": f"Error calling Browserless.io: {e}"}

        if attempt < attempts:
            time.sleep(1.5)

    return last_error or {"airport": None, "error": "Unknown Browserless error"}


def resolve_departure_airport(
    origin_kgmid: str,
    destination: str,
    departure_date: str,
    return_date: str,
    timeout_ms: int = 20000
) -> Optional[str]:
    """Return only the resolved airport code or None."""
    detail = resolve_departure_airport_detail(
        origin_kgmid, destination, departure_date, return_date, timeout_ms=timeout_ms
    )
    return detail.get("airport")


@app.get("/resolve-departure", dependencies=[Depends(authenticated_endpoint)])
def resolve_departure(
    origin: str = Query(..., description="Origin kgmid (e.g., /m/05qhw for Poland)"),
    destination: str = Query(..., description="Destination IATA code (e.g., VLC)"),
    departure: str = Query(..., description="Departure date (YYYY-MM-DD)"),
    return_date: str = Query(..., alias="return", description="Return date (YYYY-MM-DD)"),
    debug: bool = Query(False, description="Include debug info from Browserless")
):
    """
    Resolve the cheapest departure airport when searching from a country/city umbrella.

    Uses headless browser to load Google Flights and extract the suggested cheaper airport.
    """
    # Validate origin is a kgmid
    if not origin.startswith('/'):
        # If it's already an IATA code, just return it
        if re.match(r'^[A-Z]{3}$', origin.upper()):
            return {"airport": origin.upper(), "source": "direct_iata"}
        raise HTTPException(status_code=422, detail="Origin must be a kgmid (e.g., /m/05qhw) or IATA code")

    # Validate destination
    destination = destination.upper()
    if not re.match(r'^[A-Z]{3}$', destination):
        raise HTTPException(status_code=422, detail="Destination must be a 3-letter IATA code")

    # Validate dates
    try:
        dep_date = date.fromisoformat(departure)
        ret_date = date.fromisoformat(return_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be in YYYY-MM-DD format")

    if ret_date <= dep_date:
        raise HTTPException(status_code=422, detail="Return date must be after departure date")

    # Call Browserless.io to resolve
    detail = resolve_departure_airport_detail(
        origin, destination, departure, return_date, debug=debug
    )

    if detail.get("airport"):
        return {"airport": detail["airport"], "source": detail.get("source", "browserless"), "debug": detail.get("debug")}
    else:
        return {"airport": None, "error": detail.get("error", "Could not resolve departure airport"), "debug": detail.get("debug")}


@app.get("/google-flights-url", dependencies=[Depends(authenticated_endpoint)])
def google_flights_url(
    origin: str = Query(..., description="Origin kgmid or IATA code (e.g., /m/05qhw or WAW)"),
    destination: str = Query(..., description="Destination IATA code (e.g., VLC)"),
    departure: str = Query(..., description="Departure date (YYYY-MM-DD)"),
    return_date: str = Query(..., alias="return", description="Return date (YYYY-MM-DD)"),
    resolve: bool = Query(True, description="Resolve cheapest origin airport when using kgmid"),
    debug: bool = Query(False, description="Include debug info from Browserless")
):
    """
    Build a Google Flights URL, optionally resolving the cheapest origin airport.
    """
    origin = _validate_origin(origin)

    destination = destination.upper()
    if not _IATA_PATTERN.match(destination):
        raise HTTPException(status_code=422, detail="Destination must be a 3-letter IATA code")

    # Validate dates
    try:
        dep_date = date.fromisoformat(departure)
        ret_date = date.fromisoformat(return_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be in YYYY-MM-DD format")

    if ret_date <= dep_date:
        raise HTTPException(status_code=422, detail="Return date must be after departure date")

    resolved_airport = None
    debug_info = None
    source = "direct"
    origin_for_url = origin

    if resolve and origin.startswith('/'):
        detail = resolve_departure_airport_detail(origin, destination, departure, return_date, debug=debug)
        resolved_airport = detail.get("airport")
        debug_info = detail.get("debug")
        if resolved_airport:
            origin_for_url = resolved_airport
            source = detail.get("source", "browserless")

    url = build_google_flights_url(origin_for_url, destination, departure, return_date)

    return {
        "url": url,
        "origin": origin_for_url,
        "source": source,
        "resolved_airport": resolved_airport,
        "debug": debug_info
    }
