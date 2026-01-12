from datetime import date
from typing import List

from fastapi import FastAPI, Query
from pydantic import BaseModel

from .main import search_destinations



class SearchResult(BaseModel):
    city: str
    country: str
    airport: str
    avg_temp_c: float
    avg_precip_mm_per_day: float
    flight_price: float
    currency: str
    total_stops: int
    airlines: str
    best_departure: str
    best_return: str
    score: float

app = FastAPI(title="Holiday Destination Finder API")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/search", response_model=List[SearchResult])
async def search(
    origin: str = Query("WRO", description="Origin IATA Airport code"),
    start: date = Query(..., description="Start of the departure window (YYYY-MM-DD)"),
    end: date = Query(..., description="End of the departure window (YYYY-MM-DD)"),
    trip_length: int = Query(7, description="Trip length in days"),
    providers: List[str] = Query(["ryanair","wizzair"], description="Providers to use: amadeus, ryanair, wizzair"),
    top_n: int = Query(10, description="Number of top results to return")
):
    
    start_str = start.isoformat()
    end_str = end.isoformat()

    providers_lower = [p.strip().lower() for p in providers if p.strip()]

    results = search_destinations(
        origin=origin,
        start=start_str,
        end=end_str,
        trip_length=trip_length,
        providers=providers_lower,
        top_n=top_n,
    )

    return results