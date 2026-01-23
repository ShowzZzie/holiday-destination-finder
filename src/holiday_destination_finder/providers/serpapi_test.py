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
    """Get all months (1-12) covered by the date range."""
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


def _fetch_destinations_for_month(origin: str, month: int, travel_duration: int, api_key: str) -> list[dict]:
    """Fetch destinations for a single month."""
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
    logger.debug(f"[serpapi] Fetching month={month}, duration={travel_duration}")

    try:
        search = GoogleSearch(params)
        results = search.get_dict()
        return results.get("destinations", [])
    except Exception as e:
        logger.error(f"[serpapi] API error for month {month}: {e}")
        _ERRORS["api_errors"] += 1
        return []


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
        origin: Departure airport IATA code (e.g., "WRO")
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
    origin = origin.upper().strip()

    if trip_length <= 0:
        raise ValueError("trip_length must be > 0")

    api_key = _get_api_key()
    travel_duration = _trip_length_to_duration(trip_length)
    months = _months_in_range(from_date, to_date)

    logger.info(f"[serpapi] Discovering from {origin} | dates: {from_date} to {to_date} | "
                f"trip: {trip_length}d | months: {months}")

    # Parse date boundaries for filtering
    from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
    to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()

    # Fetch all months, keep all flights (not just cheapest per airport)
    # Deduplicate by (airport, dep_date, ret_date) to avoid exact duplicates from overlapping months
    seen_keys = set()
    results = []

    for month in months:
        raw_destinations = _fetch_destinations_for_month(origin, month, travel_duration, api_key)

        for dest in raw_destinations:
            try:
                # Extract airport code
                dest_airport_info = dest.get("destination_airport", {})
                airport = dest_airport_info.get("code")
                if not airport:
                    continue

                # Extract coordinates
                coords = dest.get("gps_coordinates", {})
                lat = coords.get("latitude")
                lon = coords.get("longitude")
                if lat is None or lon is None:
                    continue

                # Extract price
                price = dest.get("flight_price")
                if price is None:
                    continue
                price = float(price)

                # Extract dates - skip flights without specific dates
                dep_date = dest.get("start_date")
                ret_date = dest.get("end_date")

                if not dep_date or not ret_date:
                    # Skip flights without specific dates - can't fetch accurate weather
                    continue

                # Filter by date range
                dep_dt = datetime.strptime(dep_date, "%Y-%m-%d").date()
                ret_dt = datetime.strptime(ret_date, "%Y-%m-%d").date()
                if dep_dt < from_dt or ret_dt > to_dt:
                    continue

                # Deduplicate exact same flight (airport + dates)
                key = (airport, dep_date, ret_date)
                if key in seen_keys:
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

            except (ValueError, TypeError, KeyError) as e:
                logger.debug(f"[serpapi] Skipping malformed destination: {e}")
                continue

    results.sort(key=lambda x: x["price"])

    logger.info(f"[serpapi] Found {len(results)} flight options from {origin}")
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
        from_date="2026-06-01",
        to_date="2026-07-31",
        trip_length=7,
    )

    logger.info(f"\n=== Found {len(results)} destinations ===")
    for dest in results[:15]:
        logger.info(
            f"{dest['city']} ({dest['airport']}) - "
            f"EUR {dest['price']} | {dest['stops']} stops | {dest['airline']} | "
            f"{dest['dep_date']} -> {dest['ret_date']}"
        )

    logger.info(f"\nAPI Stats: {serpapi_call_stats()}")
