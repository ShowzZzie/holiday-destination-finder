def get_weather_data(lat, lon, start_date, end_date):
    url=f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_mean,precipitation_sum&start_date={start_date}&end_date={end_date}"
    print(url)