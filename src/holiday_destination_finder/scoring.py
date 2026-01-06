#from holiday_destination_finder.providers.amadeus import stub_prices


def total_score(weather_data, flight_price, total_stops, min_price, max_price) -> float:
    p = price_score(float(flight_price), min_price, max_price) * stop_penalty(total_stops)
    w = weather_score(weather_data)
    return 0.6 * p + 0.4 * w




def price_score(price: float, min_price: float, max_price: float) -> float:
    if price is None:
        return 0.0
    if max_price == min_price:
        return 100.0
    score = 100.0 * (max_price - price) / (max_price - min_price)
    return max(0.0, min(100.0, score))


def weather_score(weather):
    temp = weather["avg_temp_c"]
    rain = weather["avg_precip_mm_per_day"]

    temp_score = 100

    if temp < 20:
        temp_score = max(0, 100 - (20 - temp) * 8)
    elif temp > 26:
        temp_score = max(0, 100 - (temp - 26) * 8)

    rain_score = max(0, 100 - (rain * 15))

    return 0.6 * temp_score + 0.4 * rain_score



def stop_penalty(total_stops: int) -> float:
    total_stops = max(0, int(total_stops))
    return max(0.5, 1.0 - 0.1 * total_stops)