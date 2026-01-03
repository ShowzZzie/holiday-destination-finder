from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_cheapest_flight_prices
from holiday_destination_finder.scoring import total_score
import csv

def main():

    with open('data/cities.csv', 'r') as cities_csv:
        reader = csv.DictReader(cities_csv)

        for row in reader:

            city = row['city']
            country = row['country']
            lat = row['lat']
            lon = row['lon']
            airport = row['airport']
            
            avg_temp = get_weather_data(float(lat), float(lon), '2026-01-01', '2026-01-11')
            flight_price = get_cheapest_flight_prices('WRO', airport, '2026-01-01', '2026-01-11')
            trip_score = total_score(avg_temp, flight_price)
            
            print(f"{city}, {country} — Avg Temp: {avg_temp['avg_temp_c']}°C | Avg Precip: {avg_temp['avg_precip_mm_per_day']}mm/day | Flight Price: ${flight_price} | Score: {trip_score:.2f}")

if __name__ == "__main__":
    main()