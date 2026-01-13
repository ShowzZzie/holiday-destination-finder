import os, json, traceback
import redis

from holiday_destination_finder.kv_queue import QUEUE, set_running, set_done, set_failed
from holiday_destination_finder.main import search_destinations

r = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)

def main():
    while True:
        item = r.blpop(QUEUE, timeout=10)
        if not item:
            continue

        _, job_id = item
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

            results = search_destinations(origin, start, end, trip_length, providers, top_n=top_n, verbose=False)

            payload = {"meta": {"origin": origin, "start": start, "end": end,
                                "trip_length": trip_length, "providers": providers, "top_n": top_n},
                       "results": results}
            set_done(job_id, payload)

        except Exception as e:
            set_failed(job_id, f"{e}\n{traceback.format_exc()}")

if __name__ == "__main__":
    main()
