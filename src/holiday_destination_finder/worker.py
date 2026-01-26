import os, json, traceback
import redis
import time
import logging

from holiday_destination_finder.kv_queue import QUEUE, set_running, set_done, set_failed, set_progress, get_job
from holiday_destination_finder.main import search_destinations

logger = logging.getLogger(__name__)

r = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)

def main():
    while True:
        item = r.blpop(QUEUE, timeout=10)
        if not item:
            continue

        _, job_id = item
        
        # Check if job was cancelled before we start processing
        job_data = get_job(job_id)
        if not job_data or job_data.get("status") == "cancelled":
            logger.info(f"[worker] Job {job_id} was cancelled before processing, skipping")
            continue
        
        try:
            set_running(job_id)
            raw = r.hget(f"job:{job_id}", "params")
            params = json.loads(raw) if raw else {}

            origin = params.get("origin", "WRO")
            start = params.get("start")
            end = params.get("end")
            trip_length = int(params.get("trip_length", 7))
            providers = params.get("providers", ["ryanair", "wizzair"])
            top_n = int(params.get("top_n", 10))

            last_update = 0.0
            cancelled = False

            def progress_cb(
                idx: int,
                total: int,
                city: str,
                airport: str,
                origin_airport: str = None,
                origin_airport_idx: int = None,
                origin_airport_total: int = None
            ):
                nonlocal last_update, cancelled
                
                # Check for cancellation periodically
                if idx % 10 == 0:  # Check every 10 destinations
                    job_status = r.hget(f"job:{job_id}", "status")
                    if job_status == "cancelled":
                        cancelled = True
                        return
                
                now = time.monotonic()
                if now - last_update >= 1.0:
                    set_progress(
                        job_id, idx, total, city, airport,
                        origin_airport, origin_airport_idx, origin_airport_total
                    )
                    last_update = now

            results = search_destinations(origin, start, end, trip_length, providers, top_n=top_n, verbose=False, progress_cb=progress_cb)

            # Check if job was cancelled during processing
            job_status = r.hget(f"job:{job_id}", "status")
            if job_status == "cancelled" or cancelled:
                logger.info(f"[worker] Job {job_id} was cancelled during processing, skipping result save")
                continue

            payload = {"meta": {"origin": origin, "start": start, "end": end,
                                "trip_length": trip_length, "providers": providers, "top_n": top_n},
                       "results": results}
            set_done(job_id, payload)

        except Exception as e:
            # Only set failed if job wasn't cancelled
            job_status = r.hget(f"job:{job_id}", "status")
            if job_status != "cancelled":
                set_failed(job_id, f"{e}\n{traceback.format_exc()}")

if __name__ == "__main__":
    main()
