from datetime import datetime, timedelta
from fli.models import (
    Airport,
    Airline,
    PassengerInfo,
    SeatType,
    MaxStops,
    SortBy,
    FlightSearchFilters,
    DateSearchFilters,
    FlightSegment,
    TripType
)
from fli.search import SearchFlights, SearchDates
from currency_converter import CurrencyConverter
import time, os

c = CurrencyConverter()


_CALLS = {
    "searches": 0,
    "date_checks": 0,
    "date_searches": 0  # SearchDates API calls
}

_ERRORS = {
    "429_err_det": 0,
    "other_err_det": 0
}

def wizzair_call_stats():
    return {"calls": dict(_CALLS), "errors": dict(_ERRORS)}

def _status_code(e: Exception):
    resp = getattr(e, "response", None)
    return getattr(resp, "status_code", None)

def _search_with_retries(filters, max_retries=5, base_sleep=1.0):
    last_was_429 = False
    for att in range(max_retries + 1):
        _CALLS["searches"] += 1
        try:
            return SearchFlights().search(filters)
        except Exception as e:
            code = _status_code(e)
            msg = str(e).lower()
            if code == 429 or "429" in msg or "too many requests" in msg:
                last_was_429 = True
                time.sleep(base_sleep * (2 ** att))
                continue
            _ERRORS["other_err_det"] += 1
            return None

    if last_was_429:
        _ERRORS["429_err_det"] += 1
    return None


def _search_dates_with_retries(filters, max_retries=5, base_sleep=1.0):
    """
    Search using SearchDates with retry logic.
    Returns list of DatePrice objects or None on failure.
    """
    last_was_429 = False
    for att in range(max_retries + 1):
        _CALLS["date_searches"] += 1
        try:
            return SearchDates().search(filters)
        except Exception as e:
            code = _status_code(e)
            msg = str(e).lower()
            if code == 429 or "429" in msg or "too many requests" in msg:
                last_was_429 = True
                time.sleep(base_sleep * (2 ** att))
                continue
            _ERRORS["other_err_det"] += 1
            return None
    
    if last_was_429:
        _ERRORS["429_err_det"] += 1
    return None



def _get_source_currency() -> str:
    """
    Decide what currency fli numeric prices are in.

    Priority:
      1) FLI_SOURCE_CCY (explicit override, e.g. EUR/PLN/USD)
      2) USER_LOCAL_CURRENCY (set once in main or shell)
      3) If on Render (RENDER=true) -> EUR
      4) Fallback -> EUR
    """
    env_ccy = os.getenv("FLI_SOURCE_CCY")
    if env_ccy:
        src = env_ccy.strip().upper()
        print(f"[wizzair] Using source currency from FLI_SOURCE_CCY: {src}", flush=True)
        return src

    user_ccy = os.getenv("USER_LOCAL_CURRENCY")
    if user_ccy:
        src = user_ccy.strip().upper()
        print(f"[wizzair] Using source currency from USER_LOCAL_CURRENCY: {src}", flush=True)
        return src

    if os.getenv("RENDER") == "true":
        print("[wizzair] Detected Render env -> treating fli prices as EUR.", flush=True)
        return "EUR"

    print("[wizzair] No explicit currency set, defaulting fli source currency to EUR.", flush=True)
    return "EUR"




def find_cheapest_trip(origin: str, destination: str, from_date: str, to_date: str, trip_length: int):
    """
    Find cheapest trips.
    - When running locally: Uses SearchFlights for each date (simpler, more reliable)
    - When running on web (RENDER=true): Uses SearchDates API for faster performance, then verifies with SearchFlights
    Returns list of (price, currency, stops, airline, dep, ret) tuples.
    """
    origin = origin.upper()
    destination = destination.upper()

    if trip_length <= 0:
        raise ValueError("trip_length must be > 0")

    from_date_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_date_dt = datetime.strptime(to_date, "%Y-%m-%d")
    if to_date_dt < from_date_dt:
        raise ValueError("to_date must be >= from_date")

    try:
        # Validate airport codes
        _ = Airport[origin]
        _ = Airport[destination]
    except KeyError:
        _ERRORS["other_err_det"] += 1
        return []

    source_currency = _get_source_currency()
    
    # Use simpler SearchFlights approach when running locally
    if os.getenv("RENDER") != "true":
        return _find_cheapest_trip_simple(origin, destination, from_date, to_date, trip_length, source_currency)
    
    # Use SearchDates hybrid approach when on web
    return _find_cheapest_trip_with_searchdates(origin, destination, from_date, to_date, trip_length, source_currency)


def _find_cheapest_trip_simple(origin: str, destination: str, from_date: str, to_date: str, trip_length: int, source_currency: str):
    """
    Simple approach: Use SearchFlights for each date combination (used when running locally).
    """
    from_date_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_date_dt = datetime.strptime(to_date, "%Y-%m-%d")
    trips = []
    
    print(f"[wizzair] Using SearchFlights approach (local mode) for {origin} → {destination}", flush=True)
    
    while from_date_dt <= to_date_dt - timedelta(days=trip_length):
        _CALLS["date_checks"] += 1
        dep = from_date_dt.date().isoformat()
        ret = (from_date_dt + timedelta(days=trip_length)).date().isoformat()

        print(f"[wizzair] checked dep={dep} ret={ret}", flush=True)
        
        try:
            flight_segments = [
                FlightSegment(
                    departure_airport = [[Airport[origin], 0]],
                    arrival_airport = [[Airport[destination], 0]],
                    travel_date = dep
                ),
                FlightSegment(
                    departure_airport = [[Airport[destination], 0]],
                    arrival_airport = [[Airport[origin], 0]],
                    travel_date = ret
                )
            ]
        except KeyError:
            _ERRORS["other_err_det"] += 1
            from_date_dt += timedelta(days=1)
            continue

        filters = FlightSearchFilters(
            passenger_info = PassengerInfo(adults=1),
            flight_segments = flight_segments,
            seat_type = SeatType.ECONOMY,
            stops = MaxStops.NON_STOP,
            sort_by = SortBy.CHEAPEST,
            airlines = [Airline["W6"]],
            trip_type = TripType.ROUND_TRIP
        )

        flight_results = _search_with_retries(filters)
        if not flight_results:
            from_date_dt += timedelta(days=1)
            continue

        try:
            outbound, return_flight = flight_results[0]
            p_out = float(outbound.price)
            p_ret = float(return_flight.price)
            EPS = 0.01

            if abs(p_out - p_ret) <= EPS:
                trip_price = p_out
            else:
                trip_price = min(p_out, p_ret)

            if source_currency == "EUR":
                price_eur = float(trip_price)
            else:
                price_eur = float(c.convert(trip_price, source_currency, "EUR"))
            
            dep_actual = outbound.legs[0].departure_datetime.date().isoformat()
            ret_actual = return_flight.legs[0].departure_datetime.date().isoformat()
            
            trips.append((
                round(price_eur, 2),
                "EUR",
                0,
                "Wizz Air",
                dep_actual,
                ret_actual
            ))
        except (IndexError, ValueError, TypeError, AttributeError) as e:
            _ERRORS["other_err_det"] += 1

        from_date_dt += timedelta(days=1)
    
    trips.sort(key=lambda x: x[0])
    print(f"[wizzair] Final results: {len(trips)} trips found", flush=True)
    return trips


def _find_cheapest_trip_with_searchdates(origin: str, destination: str, from_date: str, to_date: str, trip_length: int, source_currency: str):
    """
    Hybrid approach: Use SearchDates to find date combinations, then verify with SearchFlights (used on web).
    Handles date ranges > 61 days by splitting into multiple calls.
    """
    from_date_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_date_dt = datetime.strptime(to_date, "%Y-%m-%d")
    
    # IMPORTANT: to_date is the latest RETURN date, not departure date
    # So the latest departure date is: to_date - trip_length
    latest_departure_dt = to_date_dt - timedelta(days=trip_length)
    
    if latest_departure_dt < from_date_dt:
        # No valid trips possible (even earliest departure would return after to_date)
        return []
    
    # Calculate effective search range for departure dates
    effective_from = from_date_dt
    effective_to = latest_departure_dt
    total_days = (effective_to - effective_from).days + 1
    MAX_DAYS_PER_SEARCH = 61
    
    print(f"[wizzair] Searching {origin} → {destination} (depart: {from_date} to {effective_to.strftime('%Y-%m-%d')}, return by: {to_date}, trip_length={trip_length} days)", flush=True)
    
    # Collect all date-price combinations
    all_valid_dates = []
    
    # If range is <= 61 days, single call
    if total_days <= MAX_DAYS_PER_SEARCH:
        window_start = from_date
        window_end = effective_to.strftime("%Y-%m-%d")
        print(f"[wizzair] Single window search: {window_start} to {window_end}", flush=True)
        
        filters = DateSearchFilters(
            trip_type = TripType.ROUND_TRIP,
            passenger_info = PassengerInfo(adults=1),
            flight_segments = [
                FlightSegment(
                    departure_airport = [[Airport[origin], 0]],
                    arrival_airport = [[Airport[destination], 0]],
                    travel_date = window_start  # Placeholder
                ),
                FlightSegment(
                    departure_airport = [[Airport[destination], 0]],
                    arrival_airport = [[Airport[origin], 0]],
                    travel_date = window_end  # Placeholder
                )
            ],
            from_date = window_start,
            to_date = window_end,  # This is the latest departure date (effective_to)
            duration = trip_length,
            seat_type = SeatType.ECONOMY,
            stops = MaxStops.NON_STOP,
            airlines = [Airline["W6"]],
        )
        
        results = _search_dates_with_retries(filters)
        if results:
            print(f"[wizzair] Found {len(results)} date combinations", flush=True)
            for result in results:
                dep_datetime, ret_datetime = result.date
                dep_date = dep_datetime.date().isoformat()
                ret_date = ret_datetime.date().isoformat()
                
                # Filter: departure must be >= from_date AND return must be <= to_date
                # This matches old code logic: only trips where ret_date <= to_date
                dep_date_dt = datetime.strptime(dep_date, "%Y-%m-%d").date()
                ret_date_dt = datetime.strptime(ret_date, "%Y-%m-%d").date()
                
                if from_date_dt.date() <= dep_date_dt <= effective_to.date() and ret_date_dt <= to_date_dt.date():
                    all_valid_dates.append({
                        'dep_date': dep_date,
                        'ret_date': ret_date,
                        'price_raw': result.price,
                    })
        else:
            print(f"[wizzair] No results found for {window_start} to {window_end}", flush=True)
    else:
        # Split into multiple 61-day windows (with 1-day overlap to ensure no dates missed)
        # Window 1: days 0-60 (61 days)
        # Window 2: days 60-120 (overlap at day 60)
        # This ensures every date is covered at least once
        # NOTE: We're searching departure dates, so window_end should not exceed effective_to
        current_start = effective_from
        window_num = 0
        
        while current_start <= effective_to:
            # Calculate window end (61 days from start, but don't exceed effective_to)
            window_end_dt = min(current_start + timedelta(days=MAX_DAYS_PER_SEARCH - 1), effective_to)
            window_start_str = current_start.strftime("%Y-%m-%d")
            window_end_str = window_end_dt.strftime("%Y-%m-%d")
            
            window_num += 1
            print(f"[wizzair] Searching date window {window_num}: {window_start_str} to {window_end_str}", flush=True)
            
            filters = DateSearchFilters(
                trip_type = TripType.ROUND_TRIP,
                passenger_info = PassengerInfo(adults=1),
                flight_segments = [
                    FlightSegment(
                        departure_airport = [[Airport[origin], 0]],
                        arrival_airport = [[Airport[destination], 0]],
                        travel_date = window_start_str  # Placeholder
                    ),
                    FlightSegment(
                        departure_airport = [[Airport[destination], 0]],
                        arrival_airport = [[Airport[origin], 0]],
                        travel_date = window_end_str  # Placeholder
                    )
                ],
                from_date = window_start_str,
                to_date = window_end_str,
                duration = trip_length,
                seat_type = SeatType.ECONOMY,
                stops = MaxStops.NON_STOP,
                airlines = [Airline["W6"]],
            )
            
            results = _search_dates_with_retries(filters)
            if results:
                print(f"[wizzair] Window {window_num}: Found {len(results)} date combinations", flush=True)
                for result in results:
                    dep_datetime, ret_datetime = result.date
                    dep_date = dep_datetime.date().isoformat()
                    ret_date = ret_datetime.date().isoformat()
                    
                    # Filter: departure must be >= from_date AND return must be <= to_date
                    # This matches old code logic: only trips where ret_date <= to_date
                    dep_date_dt = datetime.strptime(dep_date, "%Y-%m-%d").date()
                    ret_date_dt = datetime.strptime(ret_date, "%Y-%m-%d").date()
                    
                    if from_date_dt.date() <= dep_date_dt <= effective_to.date() and ret_date_dt <= to_date_dt.date():
                        all_valid_dates.append({
                            'dep_date': dep_date,
                            'ret_date': ret_date,
                            'price_raw': result.price,
                        })
            else:
                print(f"[wizzair] Window {window_num}: No results found", flush=True)
            
            # Move to next window: advance by 60 days (creates 1-day overlap)
            # This ensures no dates are missed, and duplicates are handled by deduplication
            current_start = current_start + timedelta(days=MAX_DAYS_PER_SEARCH - 1)
    
    # Remove duplicates (same dep_date, ret_date) - keep the one with lower price
    seen = {}
    for item in all_valid_dates:
        key = (item['dep_date'], item['ret_date'])
        if key not in seen or item['price_raw'] < seen[key]['price_raw']:
            seen[key] = item
    
    all_valid_dates = list(seen.values())
    
    print(f"[wizzair] Total unique date combinations from SearchDates: {len(all_valid_dates)}", flush=True)
    
    if not all_valid_dates:
        return []
    
    # HYBRID APPROACH: Use SearchFlights to get accurate prices for each date combination
    print(f"[wizzair] Verifying prices with SearchFlights for {len(all_valid_dates)} date combinations...", flush=True)
    
    trips = []
    for idx, item in enumerate(all_valid_dates, 1):
        dep_date = item['dep_date']
        ret_date = item['ret_date']
        
        _CALLS["date_checks"] += 1
        print(f"[wizzair] checking {idx}/{len(all_valid_dates)}: {dep_date} -> {ret_date}", flush=True)

        try:
            # Use SearchFlights to get accurate price for this specific date combination
            flight_segments = [
                FlightSegment(
                    departure_airport = [[Airport[origin], 0]],
                    arrival_airport = [[Airport[destination], 0]],
                    travel_date = dep_date
                ),
                FlightSegment(
                    departure_airport = [[Airport[destination], 0]],
                    arrival_airport = [[Airport[origin], 0]],
                    travel_date = ret_date
                )
            ]
            
            filters = FlightSearchFilters(
                passenger_info = PassengerInfo(adults=1),
                flight_segments = flight_segments,
                seat_type = SeatType.ECONOMY,
                stops = MaxStops.NON_STOP,
                sort_by = SortBy.CHEAPEST,
                airlines = [Airline["W6"]],
                trip_type = TripType.ROUND_TRIP
            )
            
            flight_results = _search_with_retries(filters)
            if not flight_results:
                print(f"[wizzair] no SearchFlights results for {dep_date} -> {ret_date}", flush=True)
                continue


            if flight_results and len(flight_results) > 0:
                try:
                    outbound, return_flight = flight_results[0]
                    p_out = float(outbound.price)
                    p_ret = float(return_flight.price)
                    EPS = 0.01  # 1 cent

                    if abs(p_out - p_ret) <= EPS:
                        trip_price = p_out
                    else:
                        print(
                            f"[wizzair] WARNING: prices differ out={p_out} ret={p_ret} for {dep_date}->{ret_date} "
                            f"(taking min to avoid double count)",
                            flush=True
                        )
                        trip_price = min(p_out, p_ret)

                    if source_currency == "EUR":
                        price_eur = float(trip_price)
                    else:
                        price_eur = float(c.convert(trip_price, source_currency, "EUR"))
                    
                    # Extract actual dates from flight results (in case they differ slightly)
                    dep_actual = outbound.legs[0].departure_datetime.date().isoformat()
                    ret_actual = return_flight.legs[0].departure_datetime.date().isoformat()
                    
                    print(
                        f"[wizzair] FINAL price for {dep_actual}->{ret_actual}: {trip_price} {source_currency} => {price_eur:.2f} EUR",
                        flush=True
                    )
                    
                    trips.append((
                        round(price_eur, 2),  # price
                        "EUR",                # currency
                        0,                    # stops (non-stop as per filter)
                        "Wizz Air",           # airline
                        dep_actual,           # dep (use actual date from flight)
                        ret_actual            # ret (use actual date from flight)
                    ))
                except (IndexError, ValueError, TypeError, AttributeError) as e:
                    _ERRORS["other_err_det"] += 1
                    continue
        except Exception as e:
            _ERRORS["other_err_det"] += 1
            continue
    
    # Sort by price (EUR) - cheapest first
    trips.sort(key=lambda x: x[0])
    
    print(f"[wizzair] Final results: {len(trips)} trips with verified prices", flush=True)
    
    return trips




if __name__ == "__main__":
    origin = "WRO"
    destination = "MAD"
    from_date = "2026-05-01"
    to_date = "2026-08-31"
    trip_length = 7
    print(find_cheapest_trip(origin, destination, from_date, to_date, trip_length))
    print(_CALLS)
    print(_ERRORS)