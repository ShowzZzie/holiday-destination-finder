import time
import requests
from datetime import date, timedelta

_SESSION = requests.Session()
_CACHE = {}

def _get_json_with_retries(url: str, *, retries: int = 3, timeout=(5, 30)):
    last_exc = None
    for attempt in range(retries):
        try:
            resp = _SESSION.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            last_exc = e
            # exponential backoff: 0.5, 1.0, 2.0 ...
            time.sleep(0.5 * (2 ** attempt))
    # after retries exhausted
    raise last_exc


def get_weather_data(lat, lon, start_date, end_date):
    
    today=date.today()
    end_date_f = date.fromisoformat(end_date)
    lat = round(float(lat), 4)
    lon = round(float(lon), 4)

    if end_date_f <= today + timedelta(days=14):
        url=f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date={start_date}&end_date={end_date}"
        source = "forecast"
    else:
        url=f"https://climate-api.open-meteo.com/v1/climate?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&models=CMCC_CM2_VHR4&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
        source = "climate"

    key = (lat, lon, start_date, end_date, source)
    if key in _CACHE:
        return _CACHE[key]

    data = _get_json_with_retries(url, retries=3, timeout=(5, 30))

    temps_max = data["daily"]["temperature_2m_max"]
    temps_min = data["daily"]["temperature_2m_min"]
    precipitation = data["daily"]["precipitation_sum"]

    if not (len(temps_max) == len(temps_min) == len(precipitation)):
        raise ValueError("Inconsistent data lengths received from API")


    daily_avg_temps = [
        (max_temp + min_temp) / 2
        for max_temp, min_temp in zip(temps_max, temps_min)
    ]

    avg_temp_c = round(sum(daily_avg_temps) / len(daily_avg_temps), 1)
    avg_precip_mm_per_day = round(sum(precipitation) / len(precipitation), 2)
    
    result = {
        "avg_temp_c" : avg_temp_c,
        "avg_precip_mm_per_day" : avg_precip_mm_per_day,
        "source": source
    }
    _CACHE[key] = result

    return result