from datetime import date
from typing import List, Optional
import json
import threading

from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel

from .kv_queue import enqueue, get_job
from .worker import main as worker_main  # your existing worker loop

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

@app.on_event("startup")
def start_embedded_worker():
    # IMPORTANT: run uvicorn with --workers 1, otherwise you spawn multiple worker threads
    t = threading.Thread(target=worker_main, daemon=True)
    t.start()

@app.get("/health")
def health():
    return {"status": "ok"}

# Start a job (return immediately)
@app.get("/search", status_code=202)
def search(
    origin: str = Query("WRO"),
    start: date = Query(...),
    end: date = Query(...),
    trip_length: int = Query(7),
    providers: List[str] = Query(["ryanair", "wizzair"]),
    top_n: int = Query(10),
):
    params = {
        "origin": origin,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "trip_length": trip_length,
        "providers": [p.strip().lower() for p in providers if p.strip()],
        "top_n": top_n,
    }
    job_id = enqueue(params)
    return {"job_id": job_id}

@app.get("/jobs/{job_id}")
def job(job_id: str):
    data = get_job(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="Job not found (expired or restarted)")

    out = {"job_id": job_id, "status": data.get("status")}
    
    if "processed" in data and "total" in data:
        try:
            out["processed"] = int(data["processed"])
            out["total"] = int(data["total"])
        except ValueError:
            out["processed"] = data["processed"]
            out["total"] = data["total"]
    
    if "current" in data:
        out["current"] = data["current"]

    if "result" in data:
        out["payload"] = json.loads(data["result"])
    if "error" in data:
        out["error"] = data["error"]
    
    return out
