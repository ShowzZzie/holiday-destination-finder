from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_cheapest_flight_prices
from holiday_destination_finder.scoring import total_score
import csv, argparse, datetime

def main(origin, start, end, top_n: int = 10):

    results = []

    with open('data/cities.csv', 'r') as cities_csv:
        reader = csv.DictReader(cities_csv)

        for row in reader:

            city = row['city']
            country = row['country']
            lat = row['lat']
            lon = row['lon']
            airport = row['airport']
            
            avg_temp = get_weather_data(float(lat), float(lon), start, end)
            flight_price = get_cheapest_flight_prices(origin, airport, start, end)
            trip_score = total_score(avg_temp, flight_price)
            
            if flight_price != "N/A":
                result = {
                    "city": city,
                    "country": country,
                    "airport": airport,
                    "avg_temp_c": avg_temp["avg_temp_c"],
                    "avg_precip_mm_per_day": avg_temp["avg_precip_mm_per_day"],
                    "flight_price": flight_price,
                    "score": trip_score
                }
                results.append(result)

            #print(f"{city}, {country} — Avg Temp: {avg_temp['avg_temp_c']}°C | Avg Precip: {avg_temp['avg_precip_mm_per_day']}mm/day | Flight Price: ${flight_price} | Score: {trip_score:.2f}")

    results.sort(key=lambda x: float(x.get('score', 0)), reverse=True)
    print("Pos | City (Airport) — Score | Flight Price | Avg Temp | Avg Rainfall")
    for i, row in enumerate(results[:top_n], start=1):
        print(f"{i}. {row['city']} ({row['airport']}) — Score: {row['score']:.2f} | ${row['flight_price']} | {row['avg_temp_c']}°C | {row['avg_precip_mm_per_day']}mm/day")


def valid_date(s):
    try:
        datetime.datetime.strptime(s, "%Y-%m-%d").date().isoformat()
        return s
    except ValueError:
        msg = f"Not a valid date: '{s}'. Expected format: YYYY-MM-DD."
        raise argparse.ArgumentTypeError(msg)

def parse_args():
    p = argparse.ArgumentParser(description="Holiday Destination Finder")
    p.add_argument("--origin", "-o", type=str, help="Origin airport IATA code", required=True)
    p.add_argument("--start", "-s", type=valid_date, help="Start date (YYYY-MM-DD)", required=True)
    p.add_argument("--end", "-e", type=valid_date, help="End date (YYYY-MM-DD)", required=True)
    p.add_argument("--top_n", "-t", type=int, default = 10, help="Number of top destinations to display")
    return p.parse_args()

if __name__ == "__main__":
    args = parse_args()
    main(args.origin, args.start, args.end, args.top_n)