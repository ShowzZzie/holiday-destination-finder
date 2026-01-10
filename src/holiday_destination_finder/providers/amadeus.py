import os, requests, json, time
from datetime import date, timedelta

stub_prices = {
        "LIS": 150,
        "MAD": 100,
        "VLC": 300,
        "AGP": 222,
        "FCO": 69,
        "CTA": 111,
        "JTR": 265,
        "DBV": 420,
        "BKK": 600,
        "DMK": 675,
        "FLR": 30,
        "JFK": 512,
        "LGA": 700,
    }

_SESSION = requests.Session()

_TOKEN_CACHE = {
    "access_token": None,
    "expires_at": 0,  # unix timestamp
}

_CALLS = {
    "token": 0,
    "flight_offers": 0
}

_ERRORS_429 = {
    "429_err_det": 0
}

def amadeus_call_stats():
    return dict(_CALLS)

def amadeus_429_err_count():
    return _ERRORS_429["429_err_det"]

def get_amadeus_token():
    api_key = os.getenv("AMADEUS_API_KEY_V2TEST")
    api_secret = os.getenv("AMADEUS_API_SECRET_V2TEST")

    if not api_key or not api_secret:
        raise RuntimeError("Missing AMADEUS_API_KEY or AMADEUS_API_SECRET")

    now = time.time()

    # Reuse token if still valid (with safety margin)
    if (
        _TOKEN_CACHE["access_token"] is not None
        and now < _TOKEN_CACHE["expires_at"] - 60
    ):
        return _TOKEN_CACHE["access_token"]

    _CALLS["token"] += 1
    resp = _SESSION.post(
        "https://test.api.amadeus.com/v1/security/oauth2/token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "client_secret": api_secret,
        },
        timeout=10,
    )
    resp.raise_for_status()

    payload = resp.json()
    access_token = payload["access_token"]
    expires_in = int(payload["expires_in"])

    _TOKEN_CACHE["access_token"] = access_token
    _TOKEN_CACHE["expires_at"] = now + expires_in

    return access_token



def extract_airlines_from_offer(offer: dict) -> str:
    """
    Returns a display string like: "W6 / FR" or "LH (validating) | LH / OS"
    Works even if some fields are missing.
    """
    carriers = set()

    for itin in offer.get("itineraries", []):
        for seg in itin.get("segments", []):
            # Common Amadeus keys
            for key in ("carrierCode", "marketingCarrierCode", "operatingCarrierCode"):
                code = seg.get(key)
                if code:
                    carriers.add(code)

    validating = offer.get("validatingAirlineCodes") or []
    validating_str = ""
    if validating:
        validating_str = f"{'/'.join(validating)} (validating) | "

    if not carriers and validating:
        return "/".join(validating)

    if not carriers:
        return "N/A"

    return validating_str + " / ".join(sorted(carriers))





def _get_with_retries(url, headers, params, timeout=15, max_retries=3, base_sleep=1.0):
    """
    Retries on 429 and some 5xx. Returns a Response or raises the last HTTPError.
    """
    last_exc = None

    for attempt in range(max_retries + 1):
        resp = _SESSION.get(url, headers=headers, params=params, timeout=timeout)

        # Success
        if resp.status_code < 400:
            return resp

        # Retry-worthy
        if resp.status_code in (429, 500, 502, 503, 504):
            # Respect Retry-After if present (Amadeus sometimes sends it)
            retry_after = resp.headers.get("Retry-After")
            if retry_after is not None:
                try:
                    sleep_s = float(retry_after)
                except ValueError:
                    sleep_s = base_sleep * (2 ** attempt)
            else:
                sleep_s = base_sleep * (2 ** attempt)

            time.sleep(sleep_s)
            last_exc = requests.HTTPError(f"{resp.status_code} {resp.reason}", response=resp)
            continue

        # Non-retry errors: break immediately
        resp.raise_for_status()

    # out of retries
    if last_exc:
        raise last_exc
    resp.raise_for_status()





def get_cheapest_offer_for_dates(origin, destination, from_date, to_date, trip_length):
    
    url = "https://test.api.amadeus.com/v2/shopping/flight-offers"
    headers = {"Authorization": f"Bearer {get_amadeus_token()}"}
    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": from_date,
        "returnDate": to_date,
        "adults": 1,
        "max": 10,
    }

    _CALLS["flight_offers"] += 1
    try:
        resp = _get_with_retries(url, headers, params, timeout=15, max_retries=3, base_sleep=1.0)
    except requests.HTTPError as e:
        status = getattr(e.response, "status_code", None)

        # If we still ended up rate-limited after retries, skip this date
        if status == 429:
            _ERRORS_429["429_err_det"] += 1
            return None, None, None, None

        # For other failures: re-raise (so you notice config problems)
        raise

    data = resp.json()


    offers = data.get("data", [])
    if not offers:
        return None, None, None, None


    best = min(offers, key=lambda o: float(o["price"]["total"]))
    airlines = extract_airlines_from_offer(best)


    itineraries = best.get("itineraries", [])
    if len(itineraries) < 2:
        # Defensive: should not happen for round-trip, but don't crash
        return None, None, None, None

    out_stops = len(itineraries[0]["segments"]) - 1
    ret_stops = len(itineraries[1]["segments"]) - 1
    total_stops = out_stops + ret_stops

    cheapest_price = float(best["price"]["total"])
    cheapest_currency = best["price"]["currency"]


    """filename = f"amadeus_flight_offers_{origin}_{destination}_{from_date}_{to_date}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
    print("Saved to: ", filename)"""

    return cheapest_price, cheapest_currency, total_stops, airlines

    #return stub_prices.get(destination, "N/A")



def get_best_offer_in_window(origin: str, destination: str, from_date: str, to_date: str, trip_length: int, sleep_s: float = 0.0):
    """
    Tries every valid departure date in [from_date, to_date] such that
    returnDate = departureDate + trip_length days is still within the window.
    Returns:
      (best_price, best_currency, best_stops, airlines, best_departure_date, best_return_date)
    or None if nothing found.
    """
    start_dt = date.fromisoformat(from_date)
    end_dt = date.fromisoformat(to_date)

    if trip_length <= 0:
        raise ValueError("trip_length must be > 0")

    last_start = end_dt - timedelta(days=trip_length)
    if last_start < start_dt:
        return None

    best = None  # tuple(price, currency, stops, airlines, dep, ret)
    offers = []

    d = start_dt
    print(f"[amadeus] probing {origin}->{destination} from {from_date} to {to_date} (trip_length={trip_length})")
    while d <= last_start:
        dep = d.isoformat()
        ret = (d + timedelta(days=trip_length)).isoformat()

        price, currency, stops, airlines = get_cheapest_offer_for_dates(
            origin, destination, dep, ret, trip_length
        )
        offers.append(get_cheapest_offer_for_dates(origin, destination, dep, ret, trip_length))

        print(f"[amadeus] checked dep={dep} ret={ret} -> price={'None' if price is None else price}")
        if price is not None:
            if best is None or price < best[0]:
                best = (price, currency, stops, airlines, dep, ret)


        if sleep_s:
            time.sleep(sleep_s)

        d += timedelta(days=1)

    print(f"[amadeus] finished window search | best={best}")
    #return best
    return offers



if __name__ == "__main__":
    print(get_amadeus_token())
    print(get_best_offer_in_window("WRO", "CTA", "2026-01-16", "2026-01-23", 7))