def total_score(weather_data, flight_price, total_stops, min_price, max_price) -> float:
    p = price_score(float(flight_price), min_price, max_price) * stop_penalty(total_stops)
    w = weather_score(weather_data)
    return 0.4 * p + 0.6 * w




def price_score(price: float, min_price: float, max_price: float) -> float:
    if price is None:
        return 0.0
    if max_price == min_price:
        return 100.0

    norm = (price - min_price) / (max_price - min_price)
    norm = max(0.0, min(1.0, norm))

    score = 100.0 - 50.0 * norm
    return max(0.0, min(100.0, score))


def weather_score(weather):
    temp = weather["avg_temp_c"]
    rain = weather["avg_precip_mm_per_day"]

    ideal_temp = 26.0
    penalty_per_degree = 3.0

    temp_score = max(0.0, 100.0 - penalty_per_degree * abs(temp - ideal_temp))

    if rain < 0.2:
        effective_rain = 0.0
    elif rain < 1.0:
        effective_rain = 0.5
    else:
        effective_rain = rain

    rain_score = max(0, 100 - (effective_rain * 15))

    return 0.6 * temp_score + 0.4 * rain_score



def stop_penalty(total_stops: int) -> float:
    total_stops = max(0, int(total_stops))
    return max(0.5, 1.0 - 0.1 * total_stops)