from holiday_destination_finder.providers.amadeus import stub_prices

def total_score(weather_data, flight_price):
    if flight_price in (None, "N/A"):
        return weather_score(weather_data) * 0.4
    return price_score(flight_price) * 0.6 + weather_score(weather_data) * 0.4



def price_score(price):

    if price in (None, "N/A"):
        return 0
    
    max_price = max(stub_prices.values())
    min_price = min(stub_prices.values())
    
    if max_price == min_price:
        return 100

    return 100 * (max_price - price) / (max_price - min_price)


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