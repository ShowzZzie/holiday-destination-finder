"""
SerpAPI Google Travel Explore provider.

Unlike ryanair/wizzair providers, SerpAPI DISCOVERS destinations for you.
No CSV needed - one API call returns destinations with prices, stops, airlines, dates, AND coordinates.

Input:  origin, from_date, to_date, trip_length
Output: List of destinations ready for weather scoring
"""

import os
import logging
from datetime import datetime
from serpapi import GoogleSearch

# Load environment variables from .env file (for local development)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv not installed, skip .env file loading
    pass

logger = logging.getLogger(__name__)

_CALLS = {"searches": 0}
_ERRORS = {"api_errors": 0}


def serpapi_call_stats():
    return {"calls": dict(_CALLS), "errors": dict(_ERRORS)}


def _get_api_key() -> str:
    key = os.getenv("SERPAPI_API_KEY")
    if not key:
        raise RuntimeError("Missing SERPAPI_API_KEY environment variable")
    return key


def _trip_length_to_duration(days: int) -> int:
    """
    Map trip_length to SerpAPI travel_duration.
    1 = weekend (1-3 days)
    2 = 1 week (4-9 days)
    3 = 2 weeks (10+ days)
    """
    if days <= 3:
        return 1
    elif days <= 9:
        return 2
    return 3


def _months_in_range(from_date: str, to_date: str) -> list[int]:
    """Get all months (1-12) covered by the date range. Note: SerpAPI month is 1-12 only, no year."""
    start = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")

    months = set()
    current = start
    while current <= end:
        months.add(current.month)
        # Move to next month
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    return sorted(months)


def _fetch_destinations_for_month(origin: str, month: int, travel_duration: int, api_key: str) -> tuple[list[dict], dict]:
    """Fetch destinations for a single month. Returns (destinations, raw_meta) for logging."""
    params = {
        "engine": "google_travel_explore",
        "departure_id": origin,
        "currency": "EUR",
        "type": "1",  # round trip
        "travel_duration": travel_duration,
        "month": month,
        "hl": "en",
        "api_key": api_key,
    }

    _CALLS["searches"] += 1
    logger.info(f"[serpapi] Request month={month} (1=Jan..12=Dec) | travel_duration={travel_duration} | params={dict((k, v) for k, v in params.items() if k != 'api_key')}")

    try:
        search = GoogleSearch(params)
        results = search.get_dict()
        destinations = results.get("destinations", [])
        meta = {
            "status": results.get("search_metadata", {}).get("status"),
            "error": results.get("error"),
            "top_keys": list(results.keys()),
        }
        logger.info(f"[serpapi] Response month={month}: status={meta['status']} | error={meta['error']} | "
                   f"destinations={len(destinations)} | response_keys={meta['top_keys']}")
        if not destinations and meta["error"]:
            logger.warning(f"[serpapi] API returned error for month {month}: {meta['error']}")
        if destinations:
            sample = destinations[0]
            logger.info(f"[serpapi] Sample destination month={month}: name={sample.get('name')} airport={sample.get('destination_airport', {}).get('code')} "
                       f"start={sample.get('start_date')} end={sample.get('end_date')} price={sample.get('flight_price')}")
        return destinations, meta
    except Exception as e:
        logger.error(f"[serpapi] API error for month {month}: {e}", exc_info=True)
        _ERRORS["api_errors"] += 1
        return [], {"status": None, "error": str(e), "top_keys": []}


def discover_destinations(
    origin: str,
    from_date: str,
    to_date: str,
    trip_length: int,
) -> list[dict]:
    """
    Discover flight destinations from origin within date range.

    This replaces both the CSV file AND provider calls.
    One/few API calls return everything needed for scoring.

    Args:
        origin: Departure airport IATA code (e.g., "WRO") or kgmid (e.g. "/m/0861k")
        from_date: Earliest departure date (YYYY-MM-DD)
        to_date: Latest return date (YYYY-MM-DD)
        trip_length: Trip duration in days

    Returns:
        List of destination dicts ready for weather scoring:
        {
            "city": "Barcelona",
            "country": "Spain",
            "lat": 41.385,
            "lon": 2.173,
            "airport": "BCN",
            "price": 89.0,
            "currency": "EUR",
            "stops": 0,
            "airline": "Ryanair",
            "dep_date": "2026-06-15",
            "ret_date": "2026-06-22",
        }
    """
    origin = origin.strip()
    if not origin.startswith('/'):
        origin = origin.upper()

    if trip_length <= 0:
        raise ValueError("trip_length must be > 0")

    api_key = _get_api_key()
    travel_duration = _trip_length_to_duration(trip_length)
    months = _months_in_range(from_date, to_date)

    from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
    to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    today = datetime.utcnow().date()
    months_ahead = (from_dt - today).days // 30 if from_dt > today else 0

    logger.info(
        f"[serpapi] Discovering from {origin} | dates: {from_date} to {to_date} | "
        f"trip: {trip_length}d | travel_duration={travel_duration} | months={months}"
    )
    logger.info(
        f"[serpapi] Date context: today={today} | from_dt={from_dt} to_dt={to_dt} | "
        f"~{months_ahead} months from today. SerpAPI only supports 'next 6 months' for month param."
    )
    if months_ahead > 6:
        logger.warning(
            f"[serpapi] Requested range is >6 months from today. SerpAPI may return no results for those months."
        )

    # Fetch all months, keep all flights (not just cheapest per airport)
    # Deduplicate by (airport, dep_date, ret_date) to avoid exact duplicates from overlapping months
    seen_keys = set()
    results = []
    skip_counts = {"no_airport": 0, "no_coords": 0, "no_price": 0, "no_dates": 0, "date_filter": 0, "dedupe": 0, "malformed": 0}

    date_filter_samples: list[tuple[str, str, str]] = []  # (month, dep_date, ret_date) for first few drops

    for month in months:
        raw_destinations, _ = _fetch_destinations_for_month(origin, month, travel_duration, api_key)
        kept_this_month = 0
        skipped_date_filter_this_month = 0

        for dest in raw_destinations:
            try:
                dest_airport_info = dest.get("destination_airport", {})
                airport = dest_airport_info.get("code")
                if not airport:
                    skip_counts["no_airport"] += 1
                    continue

                coords = dest.get("gps_coordinates", {})
                lat = coords.get("latitude")
                lon = coords.get("longitude")
                if lat is None or lon is None:
                    skip_counts["no_coords"] += 1
                    continue

                price = dest.get("flight_price")
                if price is None:
                    skip_counts["no_price"] += 1
                    continue
                price = float(price)

                dep_date = dest.get("start_date")
                ret_date = dest.get("end_date")
                if not dep_date or not ret_date:
                    skip_counts["no_dates"] += 1
                    continue

                dep_dt = datetime.strptime(dep_date, "%Y-%m-%d").date()
                ret_dt = datetime.strptime(ret_date, "%Y-%m-%d").date()
                if dep_dt < from_dt or ret_dt > to_dt:
                    skip_counts["date_filter"] += 1
                    skipped_date_filter_this_month += 1
                    if len(date_filter_samples) < 5:
                        date_filter_samples.append((str(month), dep_date, ret_date))
                    continue

                key = (airport, dep_date, ret_date)
                if key in seen_keys:
                    skip_counts["dedupe"] += 1
                    continue
                seen_keys.add(key)

                entry = {
                    "city": dest.get("name", "Unknown"),
                    "country": dest.get("country", "Unknown"),
                    "lat": float(lat),
                    "lon": float(lon),
                    "airport": airport,
                    "price": round(price, 2),
                    "currency": "EUR",
                    "stops": int(dest.get("number_of_stops", 0)),
                    "airline": dest.get("airline", "Unknown"),
                    "dep_date": dep_date,
                    "ret_date": ret_date,
                }
                results.append(entry)
                kept_this_month += 1

            except (ValueError, TypeError, KeyError) as e:
                skip_counts["malformed"] += 1
                logger.debug(f"[serpapi] Skipping malformed destination: {e} | dest={dest.get('name'), dest.get('destination_airport')}")
                continue

        logger.info(
            f"[serpapi] Month {month}: raw={len(raw_destinations)} | kept={kept_this_month} | "
            f"skipped_date_filter={skipped_date_filter_this_month}"
        )

    results.sort(key=lambda x: x["price"])

    logger.info(
        f"[serpapi] Totals: {len(results)} flight options from {origin} | skips: {skip_counts}"
    )
    if skip_counts["date_filter"] > 0:
        logger.warning(
            f"[serpapi] {skip_counts['date_filter']} results dropped by date filter (dep < {from_date} or ret > {to_date}). "
            "API may return dates outside your range (e.g. different year) since month has no year."
        )
        if date_filter_samples:
            logger.info(
                f"[serpapi] Sample date-filtered (month, dep, ret): {date_filter_samples}"
            )
    return results


def discover_as_tuples(
    origin: str,
    from_date: str,
    to_date: str,
    trip_length: int,
) -> list[tuple]:
    """
    Same as discover_destinations but returns standard tuple format.

    Returns:
        List of (price, currency, stops, airline, dep_date, ret_date)
        Plus destination info accessible via the full discover_destinations call.
    """
    destinations = discover_destinations(origin, from_date, to_date, trip_length)
    return [
        (d["price"], d["currency"], d["stops"], d["airline"], d["dep_date"], d["ret_date"])
        for d in destinations
    ]


if __name__ == "__main__":
    from holiday_destination_finder.config import setup_logging
    setup_logging("DEBUG")

    results = discover_destinations(
        origin="WRO",
        from_date="2026-07-01",
        to_date="2026-08-31",
        trip_length=10,
    )

    logger.info(f"\n=== Found {len(results)} destinations ===")
    for dest in results[:15]:
        logger.info(
            f"{dest['city']} ({dest['airport']}) - "
            f"EUR {dest['price']} | {dest['stops']} stops | {dest['airline']} | "
            f"{dest['dep_date']} -> {dest['ret_date']}"
        )

    logger.info(f"\nAPI Stats: {serpapi_call_stats()}")
