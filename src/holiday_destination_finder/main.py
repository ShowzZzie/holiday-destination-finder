from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_cheapest_flight_prices
import csv

weather = get_weather_data(38.7077, -9.1363, '2026-01-07', '2026-01-11')
print(weather)

prices = get_cheapest_flight_prices('WRO', 'LIS', '2026-01-07', '2026-01-11')
print(prices)

with open('data/cities.csv', 'r') as cities_csv:
    reader = csv.reader(cities_csv)

    for row in reader:
        print(row)