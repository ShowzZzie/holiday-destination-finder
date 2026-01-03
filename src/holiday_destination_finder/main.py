from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_cheapest_flight_prices
import csv

def main():
    #weather = get_weather_data(38.7077, -9.1363, '2026-01-07', '2026-01-11')

    #prices = get_cheapest_flight_prices('WRO', 'LIS', '2026-01-07', '2026-01-11')

    with open('data/cities.csv', 'r') as cities_csv:
        reader = csv.reader(cities_csv)
        next(reader) # Skip header row

        for row in reader:
            city, country, lat, lon, airport = row
            print(lat, lon)
            avg_temp = get_weather_data(lat, lon, '2026-01-07', '2026-01-11')
            flight_price = get_cheapest_flight_prices('WRO', airport, '2026-01-07', '2026-01-11')
            print(f"{city}, {country} — Avg Temp: {avg_temp['avg_temp_c']}°C | Avg Precip: {avg_temp['avg_precip_mm_per_day']}mm/day | Flight Price: ${flight_price}")

if __name__ == "__main__":
    main()