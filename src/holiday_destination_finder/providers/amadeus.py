import os, requests

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

def get_amadeus_token():
    api_key = os.getenv("AMADEUS_API_KEY")
    api_secret = os.getenv("AMADEUS_API_SECRET")

    if not api_key or not api_secret:
        raise RuntimeError("Missing AMADEUS_API_KEY or AMADEUS_API_SECRET")


    resp = _SESSION.post(
        "https://test.api.amadeus.com/v1/security/oauth2/token",
        headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data = {
            "grant_type": "client_credentials",
            "client_id": api_key,
            "client_secret": api_secret
        },
        timeout = 10
    )
    resp.raise_for_status()
    payload = resp.json()
    return payload["access_token"], payload["expires_in"]


def get_cheapest_flight_prices(origin, destination, start_date, end_date):

    """
    curl "https://test.api.amadeus.com/v1/security/oauth2/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id={client_id}&client_secret={client_secret}"
     """
    
    url = "https://test.api.amadeus.com/v2/shopping/flight-offers"
    print(get_amadeus_token())

    return stub_prices.get(destination, "N/A")

if __name__ == "__main__":
    print(get_cheapest_flight_prices("WRO", "CTA", "2026-01-06", "2026-01-13"))