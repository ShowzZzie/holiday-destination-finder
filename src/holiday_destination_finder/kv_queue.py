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
    key = f"job:{job_id}"
    r.hset(key, mapping={"status": "done", "result": json.dumps(payload)})
    r.hdel(key, "processed", "total", "current")
    r.expire(key, JOB_TTL_S)

def set_failed(job_id: str, error: str):
    key = f"job:{job_id}"
    r.hset(key, mapping={"status": "failed", "error": error})
    r.hdel(key, "processed", "total", "current")
    r.expire(key, JOB_TTL_S)

def set_progress(job_id: str, processed: int, total: int, city: str | None = None, airport: str | None = None):
    mapping = {
        "processed": str(processed),
        "total": str(total)
    }
    if city and airport:
        mapping["current"] = f"{city} ({airport})"
    r.hset(f"job:{job_id}", mapping=mapping)
    r.expire(f"job:{job_id}", JOB_TTL_S)

def get_queue_position(job_id: str) -> int | None:
    """Get the position of a job in the queue. Returns None if job is not in queue."""
    try:
        # Get all job IDs in the queue
        queue_items = r.lrange(QUEUE, 0, -1)
        if not queue_items:
            return None
        
        # Find the position of this job_id (1-based)
        try:
            position = queue_items.index(job_id)
            return position + 1  # Convert 0-based to 1-based
        except ValueError:
            # Job not in queue (might have been popped already)
            return None
    except Exception as e:
        # Log error for debugging but don't break the API
        print(f"[kv_queue] Error getting queue position: {e}")
        return None

def cancel_job(job_id: str) -> bool:
    """Cancel a job by removing it from queue and marking it as cancelled. Returns True if cancelled."""
    try:
        # Remove from queue if present
        r.lrem(QUEUE, 0, job_id)
        
        # Check if job exists
        job_key = f"job:{job_id}"
        if not r.exists(job_key):
            return False
        
        # Mark as cancelled (unless already done/failed)
        status = r.hget(job_key, "status")
        if status in ("queued", "running"):
            r.hset(job_key, mapping={"status": "cancelled"})
            r.expire(job_key, JOB_TTL_S)
            return True
        
        return False
    except Exception as e:
        print(f"[kv_queue] Error cancelling job {job_id}: {e}")
        return False