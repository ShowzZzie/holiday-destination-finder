from holiday_destination_finder.providers.openmeteo import get_weather_data

weather = get_weather_data(38.7077, -9.1363, '2026-01-13', '2026-01-20')
print(weather)