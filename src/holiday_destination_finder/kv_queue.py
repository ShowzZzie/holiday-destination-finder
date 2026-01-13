import os, json, time, uuid
import redis

r = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)

QUEUE = "queue:jobs"
JOB_TTL_S = 60 * 60  # 1 hour

def enqueue(params: dict) -> str:
    job_id = str(uuid.uuid4())
    key = f"job:{job_id}"
    r.hset(key, mapping={
        "status": "queued",
        "created_at": str(time.time()),
        "params": json.dumps(params),
    })
    r.expire(key, JOB_TTL_S)
    r.rpush(QUEUE, job_id)
    return job_id

def get_job(job_id: str) -> dict | None:
    data = r.hgetall(f"job:{job_id}")
    return data or None

def set_running(job_id: str):
    r.hset(f"job:{job_id}", "status", "running")
    r.expire(f"job:{job_id}", JOB_TTL_S)

def set_done(job_id: str, payload: dict):
    r.hset(f"job:{job_id}", mapping={"status": "done", "result": json.dumps(payload)})
    r.expire(f"job:{job_id}", JOB_TTL_S)

def set_failed(job_id: str, error: str):
    r.hset(f"job:{job_id}", mapping={"status": "failed", "error": error})
    r.expire(f"job:{job_id}", JOB_TTL_S)
