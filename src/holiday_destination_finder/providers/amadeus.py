import os, requests, json, time

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

def get_amadeus_token():
    api_key = os.getenv("AMADEUS_API_KEY")
    api_secret = os.getenv("AMADEUS_API_SECRET")

    if not api_key or not api_secret:
        raise RuntimeError("Missing AMADEUS_API_KEY or AMADEUS_API_SECRET")

    now = time.time()

    # Reuse token if still valid (with safety margin)
    if (
        _TOKEN_CACHE["access_token"] is not None
        and now < _TOKEN_CACHE["expires_at"] - 60
    ):
        return _TOKEN_CACHE["access_token"]

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




def get_cheapest_flight_prices(origin, destination, start_date, end_date):
    url = "https://test.api.amadeus.com/v2/shopping/flight-offers"
    headers = {"Authorization": f"Bearer {get_amadeus_token()}"}
    params = {
        "originLocationCode": origin,
        "destinationLocationCode": destination,
        "departureDate": start_date,
        "returnDate": end_date,
        "adults": 1,
        "max": 10,
    }

    resp = _SESSION.get(url, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    offers = data.get("data", [])
    if not offers:
        return None, None, None  # ALWAYS 3 values

    best = min(offers, key=lambda o: float(o["price"]["total"]))

    itineraries = best.get("itineraries", [])
    if len(itineraries) < 2:
        # Defensive: should not happen for round-trip, but don't crash
        return None, None, None

    out_stops = len(itineraries[0]["segments"]) - 1
    ret_stops = len(itineraries[1]["segments"]) - 1
    total_stops = out_stops + ret_stops

    cheapest_price = float(best["price"]["total"])
    cheapest_currency = best["price"]["currency"]


    filename = f"amadeus_flight_offers_{origin}_{destination}_{start_date}_{end_date}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
    print("Saved to: ", filename)

    return cheapest_price, cheapest_currency, total_stops

    #return stub_prices.get(destination, "N/A")





if __name__ == "__main__":
    print(get_amadeus_token())
    print(get_cheapest_flight_prices("WRO", "CTA", "2026-01-06", "2026-01-13"))