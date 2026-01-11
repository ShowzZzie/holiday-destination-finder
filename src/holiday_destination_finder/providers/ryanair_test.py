from datetime import datetime, timedelta
from ryanair import Ryanair
from ryanair.types import Flight

_currency = "EUR"
api = Ryanair(currency=_currency)

def get_cheapest_ryanair_offer_for_dates(origin: str, destination: str, from_date: str, to_date: str, trip_length: int):
    
    from_date_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_date_dt = datetime.strptime(to_date, "%Y-%m-%d")

    flights = []

    while from_date_dt <= to_date_dt - timedelta(days=trip_length):
        temp_flights = api.get_cheapest_return_flights(
            source_airport = origin,
            date_from = from_date_dt,
            date_to = from_date_dt, #to_date_dt - timedelta(days=trip_length),
            return_date_from = from_date_dt + timedelta(days=trip_length),
            return_date_to = from_date_dt + timedelta(days=trip_length),#to_date_dt,
            destination_airport = destination
        )
        print(f"[ryanair] checked {from_date_dt.date().isoformat()} -> found={bool(temp_flights)}")
        # only keep meaningful results
        if temp_flights:
            flights.append(temp_flights)

        from_date_dt += timedelta(days=1)

    if not flights:
        return None

    return flights


def find_cheapest_offer(trip_list):
    
    if trip_list is None or not trip_list:
        return None
    
    all_possible_flights = []

    for flight in trip_list:
        if not flight:
            continue
        try:
            price = round(float(flight[0].totalPrice), 2)
            dep = flight[0].outbound.departureTime.date().isoformat()
            ret = flight[0].inbound.departureTime.date().isoformat()
            all_possible_flights.append((price, _currency, 0, "Ryanair", dep, ret))
        except Exception:
            continue

    return all_possible_flights
    
    #print("LEN:", len(all_possible_flights))
    #print(all_possible_flights)


# what this must return finally:
# (price, currency, stops, airlines, dep, ret)
# print(find_cheapest_offer(func_call))

if __name__ == "__main__":
    origin = "WRO"              # MUST BE AN ARGUEMENT
    destination = "AGP"         # MUST BE AN ARGUEMENT
    from_date = "2026-05-01"    # MUST BE AN ARGUEMENT
    to_date = "2026-05-31"      # MUST BE AN ARGUEMENT
    trip_length = 7             # MUST BE AN ARGUEMENT
    r_from_date = "2026-02-01"
    r_to_date = "2026-12-31"
    func_call = get_cheapest_ryanair_offer_for_dates(origin, destination, from_date, to_date, trip_length)
    print(find_cheapest_offer(func_call))

