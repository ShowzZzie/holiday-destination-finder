import os
from dotenv import load_dotenv
from serpapi import GoogleSearch

# Load environment variables from .env file (for local development)
load_dotenv()

# what this must return finally:
# (price, currency, stops, airlines, dep, ret)
# input: (origin: str, destination: str, from_date: str, to_date: str, trip_length: int)

def get_destinations(origin: str, duration: int):
  api_key = os.getenv("SERPAPI_API_KEY")
  
  if not api_key:
    raise RuntimeError("Missing SERPAPI_API_KEY environment variable")

  params = {
    "engine": "google_travel_explore",
    "departure_id": origin,
    "arrival_area_id": "/m/02j9z", # ????
    "currency": "EUR",
    "type": "1",
    "travel_duration": duration, # has to match: 1 == weekend, 2 == week, 3 == two weeks
    "month": 6, # ????
    "api_key": api_key
  }

  search = GoogleSearch(params)
  results = search.get_dict()
  destinations = results["destinations"]

  for dest in destinations:
      print(dest)
      print("="*20)


if __name__ == "__main__":
  get_destinations()