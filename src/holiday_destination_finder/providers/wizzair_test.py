from datetime import datetime, timedelta
from fli.models import (
    Airport,
    Airline,
    PassengerInfo,
    SeatType,
    MaxStops,
    SortBy,
    FlightSearchFilters,
    FlightSegment,
    TripType
)
from fli.search import SearchFlights
from currency_converter import CurrencyConverter
import time

c = CurrencyConverter()

_CALLS = {
    "searches": 0,
    "date_checks": 0
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


def find_cheapest_trip(origin: str, destination: str, from_date: str, to_date: str, trip_length: int):
    found_flights = []
    origin = origin.upper()
    destination = destination.upper()

    if trip_length <= 0:
        raise ValueError("trip_length must be > 0")

    from_date_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_date_dt = datetime.strptime(to_date, "%Y-%m-%d")
    if to_date_dt < from_date_dt:
        raise ValueError("to_date must be >= from_date")

    while from_date_dt <= to_date_dt - timedelta(days=trip_length):
        _CALLS["date_checks"] += 1
        
        try:
            flight_segments_t = [
                FlightSegment(
                    departure_airport = [[Airport[origin], 0]],
                    arrival_airport = [[Airport[destination], 0]],
                    travel_date = datetime.strftime(from_date_dt, "%Y-%m-%d")
                ),
                FlightSegment(
                    departure_airport = [[Airport[destination], 0]],
                    arrival_airport = [[Airport[origin], 0]],
                    travel_date = datetime.strftime(from_date_dt + timedelta(days=trip_length), "%Y-%m-%d")
                )
            ]
        except KeyError:
            # wrong IATA code backup
            _ERRORS["other_err_det"] += 1
            return None

        filters = FlightSearchFilters(
            passenger_info = PassengerInfo(adults=1),
            flight_segments = flight_segments_t,
            seat_type = SeatType.ECONOMY,
            stops = MaxStops.NON_STOP,
            sort_by = SortBy.CHEAPEST,
            airlines = [Airline["W6"]],
            trip_type = TripType.ROUND_TRIP
        )

        found_flights.append(_search_with_retries(filters))

        from_date_dt += timedelta(days=1)
        

    best = None # best = (price, currency, stops, airlines, dep, ret)

    for helper in found_flights:
        if not helper:
            continue

        try:
            outbound, return_flight = helper[0]
        except (IndexError, ValueError, TypeError):
            _ERRORS["other_err_det"] += 1
            continue



        trip_usd = outbound.price if outbound.price == return_flight.price else (outbound.price + return_flight.price)
        try:
            trip_price = c.convert(trip_usd, "USD", "EUR")
        except Exception:
            _ERRORS["other_err_det"] += 1
            continue

        if best is None or best[0] > trip_price:
            try:
                dep = outbound.legs[0].departure_datetime.date().isoformat()
                ret = return_flight.legs[0].departure_datetime.date().isoformat()
            except Exception:
                _ERRORS["other_err_det"] += 1
                continue
            best = (round(trip_price, 2), "EUR", 0, "Wizz Air", dep, ret)

    return best


if __name__ == "__main__":
    origin = "WRO"
    destination = "MAD"
    from_date = "2026-05-01"
    to_date = "2026-05-31"
    trip_length = 7
    print(find_cheapest_trip(origin, destination, from_date, to_date, trip_length))
    print(_CALLS)
    print(_ERRORS)
