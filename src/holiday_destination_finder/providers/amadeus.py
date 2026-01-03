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

def get_cheapest_flight_prices(origin, destination, start_date, end_date):
    return stub_prices.get(destination, "N/A")