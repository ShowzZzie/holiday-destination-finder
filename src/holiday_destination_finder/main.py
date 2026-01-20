from holiday_destination_finder.providers.openmeteo import get_weather_data
from holiday_destination_finder.providers.amadeus import get_best_offer_in_window, amadeus_call_stats, amadeus_429_err_count
from holiday_destination_finder.scoring import total_score
from holiday_destination_finder.providers.ryanair_test import find_cheapest_offer, get_cheapest_ryanair_offer_for_dates
from holiday_destination_finder.providers.wizzair_test import find_cheapest_trip
from pathlib import Path
import csv, argparse, datetime, threading, time, os, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional



def _to_iso(x):
    return x.isoformat() if hasattr(x, "isoformat") else str(x)

def _normalize_providers(providers):
    if isinstance(providers, str):
        return [x.strip().lower() for x in providers.split(",") if x.strip()]
    return [str(p).strip().lower() for p in (providers or []) if str(p).strip()]




def main(origin, start, end, trip_length, providers, top_n: int = 10):

    if origin is None:
        origin = input("Enter origin airport IATA code: ")
    if start is None:
        start = input("Enter start date (YYYY-MM-DD): ")
    if end is None:
        end = input("Enter end date (YYYY-MM-DD): ")
    if trip_length is None:
        trip_length = int(input("Enter trip length in days: "))
        # start_dt_tl = datetime.datetime.strptime(start, "%Y-%m-%d")
        # end_dt_tl = datetime.datetime.strptime(end, "%Y-%m-%d")
        
        #trip_length = (end_dt_tl - start_dt_tl).days
        if trip_length <= 0:
            raise ValueError("end must be after start for inferred trip_length")

    if not os.getenv("USER_LOCAL_CURRENCY") and not os.getenv("FLI_SOURCE_CCY"):
        try:
            r = requests.get("https://ipapi.co/currency/", timeout=5)

            if r.status_code == 200 and r.ok:
                cc = r.text.strip().upper()
                if len(cc) == 3:
                    print(f"[main] Detected local currency via IPAPI: {cc}")
                    os.environ["USER_LOCAL_CURRENCY"] = cc
                else:
                    print(f"[main] IPAPI returned malformed currency '{r.text}', falling back")
            else:
                body = r.text.strip()[:100] if r.text else "NO_BODY"
                print(f"[main] IPAPI returned HTTP {r.status_code} — body: '{body}'")

        except Exception as e:
            print(f"[main] Exception during IPAPI lookup: {e}")

        # If still no currency -> fallback
        if not os.getenv("USER_LOCAL_CURRENCY"):
            fallback = "PLN"
            os.environ["USER_LOCAL_CURRENCY"] = fallback
            print(f"[main] Fallback USER_LOCAL_CURRENCY set to '{fallback}'")

    
    providers = _normalize_providers(providers)

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




def _process_single_destination(
    row: dict,
    idx: int,
    total: int,
    origin: str,
    start: str,
    end: str,
    trip_length: int,
    providers: list[str],
    weather_cache: dict,
    weather_cache_lock: threading.Lock,
    verbose: bool,
    progress_cb
) -> Optional[dict]:
    """Process a single destination and return result dict or None."""
    city = row['city']
    country = row['country']
    lat_f = float(row["lat"])
    lon_f = float(row["lon"])
    airport = row['airport']
    
    if verbose:
        print(f"[processing] CURRENT DESTINATION: {city} ({airport})", flush=True)
        print(f"[processing] {idx} / {total} destinations processed", flush=True)

    if progress_cb:
        try:
            progress_cb(idx, total, city, airport)
        except Exception:
            pass

    # Process flight providers in parallel
    offers_a: list[tuple] = []
    offers_r: list[tuple] = []
    offers_w: list[tuple] = []

    def fetch_amadeus():
        try:
            return get_best_offer_in_window(origin, airport, start, end, trip_length, sleep_s=0.2)
        except Exception as e:
            if verbose:
                print(f"[amadeus] failed for {city} ({airport}): {e}", flush=True)
            return []
    
    def fetch_ryanair():
        try:
            return find_cheapest_offer(
                get_cheapest_ryanair_offer_for_dates(origin, airport, start, end, trip_length)
            )
        except Exception as e:
            if verbose:
                print(f"[ryanair] failed for {city} ({airport}): {e}", flush=True)
            return []
    
    def fetch_wizzair():
        try:
            return find_cheapest_trip(origin, airport, start, end, trip_length)
        except Exception as e:
            if verbose:
                print(f"[wizzair] failed for {city} ({airport}): {e}", flush=True)
            return []

    # Run providers in parallel
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {}
        if "amadeus" in providers:
            futures["amadeus"] = executor.submit(fetch_amadeus)
        if "ryanair" in providers:
            futures["ryanair"] = executor.submit(fetch_ryanair)
        if "wizzair" in providers:
            futures["wizzair"] = executor.submit(fetch_wizzair)
        
        for provider, future in futures.items():
            try:
                result = future.result()
                if provider == "amadeus":
                    offers_a = result or []
                elif provider == "ryanair":
                    offers_r = result or []
                elif provider == "wizzair":
                    offers_w = result or []
            except Exception as e:
                if verbose:
                    print(f"[{provider}] exception for {city} ({airport}): {e}", flush=True)

    candidates = [trip for trip in (offers_a + offers_r + offers_w) if trip is not None]
    if not candidates:
        return None

    price_list = [float(tup[0]) for tup in candidates]
    loc_min_price = min(price_list)
    loc_max_price = max(price_list)

    best_tup = None
    best_score = None
    best_weather = None

    for price, curr, stops, airline, dep, ret in candidates:
        dep_s = _to_iso(dep)
        ret_s = _to_iso(ret)
        cache_key = (lat_f, lon_f, dep_s, ret_s)
        
        # Thread-safe weather cache access
        with weather_cache_lock:
            if cache_key not in weather_cache:
                try:
                    weather_data = get_weather_data(lat_f, lon_f, dep_s, ret_s)
                    weather_cache[cache_key] = weather_data
                except Exception as e:
                    if verbose:
                        print("[BUG] Failed to retrieve weather data for:", cache_key, e, flush=True)
                    continue
            weather_info = weather_cache[cache_key]

        score = total_score(weather_info, price, stops, loc_min_price, loc_max_price)
        
        if best_score is None or score > best_score:
            best_score = score
            best_tup = (price, curr, stops, airline, dep, ret)
            best_weather = weather_info

    if best_tup and best_weather is not None:
        flight_price, currency, total_stops, airlines, best_dep, best_ret = best_tup

        return {
            "city": city,
            "country": country,
            "airport": airport,
            "avg_temp_c": best_weather["avg_temp_c"],
            "avg_precip_mm_per_day": best_weather["avg_precip_mm_per_day"],
            "flight_price": float(flight_price),
            "currency": currency,
            "total_stops": total_stops,
            "airlines": airlines,
            "best_departure": _to_iso(best_dep),
            "best_return": _to_iso(best_ret),
            "weather_data": best_weather,
        }
    
    return None


def search_destinations(
    origin: str | None,
    start: str | None,
    end: str | None,
    trip_length: int | None,
    providers: list[str] | None,
    top_n: int = 10,
    verbose: bool = True,
    progress_cb = None,
    max_workers: Optional[int] = None
) -> list[dict]:
    
    providers = _normalize_providers(providers)

    if os.getenv("RENDER") == "true":
        CITIES_CSV = Path(__file__).resolve().parents[2] / "data" / "cities_web.csv"
        print(f"[main] Using web cities file: cities_web.csv")
        # Use fewer workers on web to avoid rate limits
        max_workers = max_workers or 3
    else:
        CITIES_CSV = Path(__file__).resolve().parents[2] / "data" / "cities_local.csv"
        print(f"[main] Using local cities file: cities_local.csv")
        # Use more workers locally for faster processing
        max_workers = max_workers or 10

    # Read all destinations first
    destinations = []
    with open(CITIES_CSV, newline="", encoding="utf-8") as cities_csv:
        reader = csv.DictReader(cities_csv)
        destinations = list(reader)
    
    total = len(destinations)
    print(f"[main] Processing {total} destinations with {max_workers} parallel workers", flush=True)

    results: list[dict] = []
    weather_cache: dict[tuple[float, float, str, str], dict] = {}
    weather_cache_lock = threading.Lock()
    processed_count = 0
    processed_lock = threading.Lock()

    # Process destinations in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for idx, row in enumerate(destinations, start=1):
            future = executor.submit(
                _process_single_destination,
                row, idx, total, origin, start, end, trip_length, providers,
                weather_cache, weather_cache_lock, verbose, progress_cb
            )
            futures[future] = idx

        for future in as_completed(futures):
            idx = futures[future]
            try:
                result = future.result()
                if result:
                    with processed_lock:
                        results.append(result)
                        processed_count += 1
            except Exception as e:
                if verbose:
                    print(f"[ERROR] Failed to process destination {idx}: {e}", flush=True)

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