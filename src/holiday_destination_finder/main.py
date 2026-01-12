from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_best_offer_in_window, amadeus_call_stats, amadeus_429_err_count
from holiday_destination_finder.scoring import total_score
from holiday_destination_finder.providers.ryanair_test import find_cheapest_offer, get_cheapest_ryanair_offer_for_dates
from holiday_destination_finder.providers.wizzair_test import find_cheapest_trip
from pathlib import Path
import csv, argparse, datetime, threading, time


def main(origin, start, end, trip_length, providers, top_n: int = 10):
    
    providers = [p.strip().lower() for p in (providers or [])]

    stop_event = threading.Event()
    timer_thread = threading.Thread(
        target=start_elapsed_timer,
        args=(stop_event,),
        daemon=True
    )
    timer_thread.start()

    results = search_destinations(origin, start, end, trip_length, providers, top_n)

    if not results:
        stop_event.set()
        print("No destinations with flight prices found.")
        if "amadeus" in providers:
            print("Amadeus calls:", amadeus_call_stats())
            print("Amadeus 429 Errors:", amadeus_429_err_count())
        return

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

    if "amadeus" in providers:
        print("Amadeus calls:", amadeus_call_stats())
        print("Amadeus 429 Errors:", amadeus_429_err_count())




def search_destinations(
    origin: str | None,
    start: str | None,
    end: str | None,
    trip_length: int | None,
    providers: list[str] | None,
    top_n: int = 10
) -> list[dict]:
    
    providers = [p.strip().lower() for p in (providers or [])]

    if origin is None:
        origin = "WRO"
    if start is None:
        start = "2026-05-01"
    if end is None:
        end = "2026-05-31"
    if trip_length is None:
        trip_length = 7

    results: list[dict] = []
    weather_cache: dict[tuple[float, float, str, str], dict] = {}
    CITIES_CSV = Path(__file__).resolve().parents[2] / "data" / "cities.csv"

    with open(CITIES_CSV, newline="", encoding="utf-8") as fh:
        total = sum(1 for _ in fh) - 1  # subtract header

    with open(CITIES_CSV, newline="", encoding="utf-8") as cities_csv:
        reader = csv.DictReader(cities_csv)

        for idx, row in enumerate(reader, start=1):
            city = row['city']
            country = row['country']
            lat_f = float(row["lat"])
            lon_f = float(row["lon"])
            airport = row['airport']
            print(f"[processing] CURRENT DESTINATION: {city} ({airport})", flush=True)
            print(f"[processing] {idx} / {total} destinations processed", flush=True)

            offers_a: list[tuple] = []
            offers_r: list[tuple] = []
            offers_w: list[tuple] = []

            # Amadeus
            if "amadeus" in providers:
                try:
                    offers_a = get_best_offer_in_window(origin, airport, start, end, trip_length, sleep_s=0.2)
                except Exception as e:
                    print(f"[amadeus] failed for {city} ({airport}): {e}", flush=True)

            # Ryanair
            if "ryanair" in providers:
                try:
                    offers_r = find_cheapest_offer(
                        get_cheapest_ryanair_offer_for_dates(origin, airport, start, end, trip_length)
                    )
                except Exception as e:
                    print(f"[ryanair] failed for {city} ({airport}): {e}", flush=True)

            # Wizzair
            if "wizzair" in providers:
                try:
                    offers_w = find_cheapest_trip(origin, airport, start, end, trip_length)
                except Exception as e:
                    print(f"[wizzair] failed for {city} ({airport}): {e}", flush=True)

            offers_a = offers_a or []
            offers_r = offers_r or []
            offers_w = offers_w or []

            candidates = [trip for trip in (offers_a + offers_r + offers_w) if trip is not None]
            if not candidates:
                continue

            price_list = [float(tup[0]) for tup in candidates]
            loc_min_price = min(price_list)
            loc_max_price = max(price_list)

            best_tup = None
            best_score = None
            best_weather = None

            for price, curr, stops, airline, dep, ret in candidates:
                cache_key = (lat_f, lon_f, dep, ret)
                if cache_key not in weather_cache:
                    try:
                        weather_cache[cache_key] = get_weather_data(lat_f, lon_f, dep, ret)
                    except Exception:
                        print("[BUG] Failed to retrieve weather data for:", cache_key)
                        continue
                weather_info = weather_cache[cache_key]

                score = total_score(weather_info, price, stops, loc_min_price, loc_max_price)
                
                if best_score is None or score > best_score:
                    best_score = score
                    best_tup = (price, curr, stops, airline, dep, ret)
                    best_weather = weather_info

            if best_tup and best_weather is not None:
                flight_price, currency, total_stops, airlines, best_dep, best_ret = best_tup

                result = {
                    "city": city,
                    "country": country,
                    "airport": airport,
                    "avg_temp_c": best_weather["avg_temp_c"],
                    "avg_precip_mm_per_day": best_weather["avg_precip_mm_per_day"],
                    "flight_price": float(flight_price),   # ensure numeric
                    "currency": currency,
                    "total_stops": total_stops,
                    "airlines": airlines,
                    "best_departure": best_dep,
                    "best_return": best_ret,
                    "weather_data": best_weather,              # keep full weather dict for scoring
                }
                results.append(result)

    prices = [r["flight_price"] for r in results if r.get("flight_price") is not None]
    if not prices:
        return []

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
    return results[:top_n]



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
    p.add_argument("--top_n", "-t", type=int, default=10, help="Number of top destinations to display")
    p.add_argument("--providers", "-p", type=str, default="ryanair,wizzair", help="Comma-separated list of providers to use: amadeus,ryanair,wizzair")
    return p.parse_args()

def start_elapsed_timer(stop_event: threading.Event):
    start_time = time.time()
    while not stop_event.is_set():
        elapsed = int(time.time() - start_time)
        print(f"[running] {elapsed // 60}m{elapsed % 60}s elapsed", flush=True)
        time.sleep(1)

if __name__ == "__main__":
    args = parse_args()
    providers = [p.strip().lower() for p in (args.providers or "").split(",") if p.strip()]
    main(args.origin, args.start, args.end, args.trip_length, providers, args.top_n)