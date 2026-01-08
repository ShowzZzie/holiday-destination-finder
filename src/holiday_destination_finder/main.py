from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_best_offer_in_window, amadeus_call_stats, amadeus_429_err_count
from holiday_destination_finder.scoring import total_score
from holiday_destination_finder.providers.ryanair_test import find_cheapest_offer, get_cheapest_ryanair_offer_for_dates
from pathlib import Path
import csv, argparse, datetime, requests, threading, time


def main(origin, start, end, trip_length, top_n: int = 10):

    stop_event = threading.Event()
    timer_thread = threading.Thread(
        target=start_elapsed_timer,
        args=(stop_event,),
        daemon=True
    )
    timer_thread.start()


    if origin is None:
        origin = "WRO"
    if start is None:
        start = "2026-05-01"
    if end is None:
        end = "2026-05-31"
    if trip_length is None:
        trip_length = 7

    results = []
    CITIES_CSV = Path(__file__).resolve().parents[2] / "data" / "cities.csv"

    with open(CITIES_CSV, newline="", encoding="utf-8") as fh:
        total = sum(1 for _ in fh) - 1  # subtract header

    with open(CITIES_CSV, newline="", encoding="utf-8") as cities_csv:
        reader = csv.DictReader(cities_csv)

        for idx, row in enumerate(reader, start=1):
            city = row['city']
            country = row['country']
            lat = row['lat']
            lon = row['lon']
            airport = row['airport']
            print(f"[processing] CURRENT DESTINATION: {city} ({airport})", flush=True)
            print(f"[processing] {idx} / {total} destinations processed", flush=True)
            
            try:
                avg_temp = get_weather_data(float(lat), float(lon), start, end)
            except requests.exceptions.RequestException as e:
                print(f"Weather failed for {city} ({airport}): {e}", flush=True)
                continue
            except Exception as e:
                print(f"BUG in weather logic for {city} ({airport}): {e}", flush=True)
                continue

            try:
                best_a = get_best_offer_in_window(origin, airport, start, end, trip_length, sleep_s=0.2)
                best_r = find_cheapest_offer(get_cheapest_ryanair_offer_for_dates(origin, airport, start, end, trip_length))
                if best_a is None and best_r is None:
                    continue
                elif best_a is None:
                    best = best_r
                elif best_r is None:
                    best = best_a
                else:
                    best = best_a if best_a[0] < best_r[0] else best_r
            except requests.exceptions.RequestException as e:
                print(f"Price failed for {city} ({airport}): {e}", flush=True)
                continue
            except Exception as e:
                print(f"BUG in price logic for {city} ({airport}): {e}", flush=True)
                continue

            if best is None:
                continue

            flight_price, currency, total_stops, airlines, best_dep, best_ret = best


            result = {
                "city": city,
                "country": country,
                "airport": airport,
                "avg_temp_c": avg_temp["avg_temp_c"],
                "avg_precip_mm_per_day": avg_temp["avg_precip_mm_per_day"],
                "flight_price": float(flight_price),   # ensure numeric
                "currency": currency,
                "total_stops": total_stops,
                "airlines": airlines,
                "best_departure": best_dep,
                "best_return": best_ret,
                "weather_data": avg_temp,              # keep full weather dict for scoring
            }


            results.append(result)

            #print(f"{city}, {country} — Avg Temp: {avg_temp['avg_temp_c']}°C | Avg Precip: {avg_temp['avg_precip_mm_per_day']}mm/day | Flight Price: ${flight_price} | Score: {trip_score:.2f}")

    prices = [r["flight_price"] for r in results if r.get("flight_price") is not None]
    if not prices:
        stop_event.set()
        print("No destinations with flight prices found.")
        print("Amadeus calls:", amadeus_call_stats())
        return

    min_price = min(prices)
    max_price = max(prices)

    for r in results:
        r["score"] = total_score(
            r["weather_data"],
            r["flight_price"],
            r["total_stops"],
            min_price,
            max_price,
        )
        r.pop("weather_data", None)



    results.sort(key=lambda x: float(x.get('score', 0)), reverse=True)
    print("Pos | City (Airport) — Score | Flight Price | Stops | Avg Temp | Avg Rainfall")
    for i, row in enumerate(results[:top_n], start=1):
        print(
            f"{i}. {row['city']} ({row['airport']}) — "
            f"Score: {row['score']:.2f} | "
            f"{row['currency']} {row['flight_price']} | "
            f"Stops: {row['total_stops']} | "
            f"Airlines: {row['airlines']} | "
            f"{row['best_departure']} → {row['best_return']} | "
            f"{row['avg_temp_c']}°C | {row['avg_precip_mm_per_day']}mm/day"
        )

    stop_event.set()

    print("Amadeus calls:", amadeus_call_stats())
    print("Amadeus 429 Errors:", amadeus_429_err_count())



def valid_date(s):
    try:
        datetime.datetime.strptime(s, "%Y-%m-%d").date().isoformat()
        return s
    except ValueError:
        msg = f"Not a valid date: '{s}'. Expected format: YYYY-MM-DD."
        raise argparse.ArgumentTypeError(msg)

def parse_args():
    p = argparse.ArgumentParser(description="Holiday Destination Finder")
    p.add_argument("--origin", "-o", type=str, help="Origin airport IATA code")
    p.add_argument("--start", "-s", type=valid_date, help="Start date (YYYY-MM-DD)")
    p.add_argument("--end", "-e", type=valid_date, help="End date (YYYY-MM-DD)")
    p.add_argument("--trip_length", "-tl", type=int, help="Length of the trip in days")
    p.add_argument("--top_n", "-t", type=int, default = 10, help="Number of top destinations to display")
    return p.parse_args()

def start_elapsed_timer(stop_event: threading.Event):
    start_time = time.time()
    while not stop_event.is_set():
        elapsed = int(time.time() - start_time)
        print(f"[running] {elapsed // 60}m{elapsed % 60}s elapsed", flush=True)
        time.sleep(1)

if __name__ == "__main__":
    args = parse_args()
    main(args.origin, args.start, args.end, args.trip_length, args.top_n)