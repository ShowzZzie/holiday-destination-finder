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
from fli.search import SearchFlights, SearchDates
from currency_converter import CurrencyConverter

c = CurrencyConverter()

origin = "WRO"
destination = "MAD"
from_date = "2026-05-01"
from_date_dt = datetime.strptime(from_date, "%Y-%m-%d") 
to_date = "2026-05-31"
to_date_dt = datetime.strptime(to_date, "%Y-%m-%d")
trip_length = 7

found_flights = []

while from_date_dt <= to_date_dt - timedelta(days=trip_length):
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

    filters = FlightSearchFilters(
        passenger_info = PassengerInfo(adults=1),
        flight_segments = flight_segments_t,
        seat_type = SeatType.ECONOMY,
        stops = MaxStops.NON_STOP,
        sort_by = SortBy.CHEAPEST,
        airlines = [Airline["W6"]],
        trip_type = TripType.ROUND_TRIP
    )

    search = SearchFlights().search(filters)
    found_flights.append(search)

    from_date_dt += timedelta(days=1)
    

best = None # best = (price, currency, stops, airlines, dep, ret)

for smth in found_flights:
    if not smth:
        continue

    outbound, return_flight = smth[0]
    #print(outbound.legs[0])

    if outbound.price == return_flight.price:
        trip_price = c.convert(outbound.price, "USD", "EUR")
        if best == None or best[0] > trip_price:
            best = (round(trip_price,2), "EUR", 0, "Wizz Air", outbound.legs[0].departure_datetime.date().isoformat(), return_flight.legs[0].departure_datetime.date().isoformat())
    else:
        continue

print(best)
    
"""
    print("OUTBOUND:", outbound)
    print("RETURN:", return_flight)
    for helper in smth[0]:
        flight = helper.legs[0]
        print("FROM:", flight.departure_airport.name)
        print("TO:", flight.arrival_airport.name)
        print(f"{flight.departure_datetime} — {flight.arrival_datetime}")
        print(f"PRICE: €{round(c.convert(helper.price, "USD", "EUR"), 2)}")
        print("===")
    print("------------------")
    """




"""
# Create search filters
filters = FlightSearchFilters(
    passenger_info=PassengerInfo(adults=1),
    flight_segments=[
        FlightSegment(
            departure_airport=[[Airport[origin], 0]],
            arrival_airport=[[Airport[destination], 0]],
            travel_date=(from_date),
        )
    ],
    seat_type=SeatType.ECONOMY,
    stops=MaxStops.NON_STOP,
    sort_by=SortBy.CHEAPEST,
    airlines=[Airline["W6"]]
)

print(Airline["W6"].value)

# Search flights
flights = SearchFlights().search(filters)

for a in flights:
    print(a)
"""

 

"""
# Process results
for flight in flights:
    print(f"💰 Price: ${flight.price}")
    print(f"⏱️ Duration: {flight.duration} minutes")
    print(f"✈️ Stops: {flight.stops}")

    for leg in flight.legs:
        print(f"\n🛫 Flight: {leg.airline.value} {leg.flight_number}")
        print(f"📍 From: {leg.departure_airport.value} at {leg.departure_datetime}")
        print(f"📍 To: {leg.arrival_airport.value} at {leg.arrival_datetime}")
"""
