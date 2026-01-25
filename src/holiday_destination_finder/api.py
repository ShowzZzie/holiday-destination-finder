from datetime import date
from typing import List, Optional
import json
import threading
import os
import re
import logging
import time
import redis

from fastapi import FastAPI, Query, HTTPException, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from .kv_queue import enqueue, get_job, get_queue_position, cancel_job
from .worker import main as worker_main  # your existing worker loop
from .config import setup_logging

# Initialize logging on module load
setup_logging()
logger = logging.getLogger(__name__)

# Redis connection for rate limiting
_redis = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

# API Key configuration
_API_KEY = os.environ.get("API_KEY")

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

    logger.info(f"[api] Creating search job: origin={origin}, {start} to {end}, trip_length={trip_length}, providers={providers}")
    job_id = enqueue(params)
    return {"job_id": job_id}

@app.get("/jobs/{job_id}", dependencies=[Depends(authenticated_endpoint)])
def job(job_id: str):
    data = get_job(job_id)
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
