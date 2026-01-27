import os, json, time, uuid, logging
import redis

logger = logging.getLogger(__name__)

# Import Supabase functions (optional - will fail gracefully if not configured)
try:
    from .supabase import save_search_result
except ImportError:
    save_search_result = None
    logger.warning("[kv_queue] Supabase module not available")

r = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)

QUEUE = "queue:jobs"
JOB_TTL_S = 60 * 60  # 1 hour

def enqueue(params: dict, client_id: str | None = None) -> str:
    job_id = str(uuid.uuid4())
    key = f"job:{job_id}"
    mapping = {
        "status": "queued",
        "created_at": str(time.time()),
        "params": json.dumps(params),
    }
    # Store client_id if provided (for Supabase persistence)
    if client_id:
        mapping["client_id"] = client_id
    r.hset(key, mapping=mapping)
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
    
    # Dual-write to Supabase for persistence
    if save_search_result:
        try:
            # Get client_id and params from Redis
            job_data = get_job(job_id)
            if job_data:
                client_id = job_data.get("client_id")
                params_str = job_data.get("params")
                if client_id and params_str:
                    try:
                        params = json.loads(params_str) if isinstance(params_str, str) else params_str
                        save_search_result(job_id, client_id, params, payload, "done")
                    except Exception as e:
                        # Log but don't fail - Redis write succeeded
                        logger.error(f"[kv_queue] Failed to write to Supabase for job {job_id}: {e}")
        except Exception as e:
            logger.error(f"[kv_queue] Error during Supabase dual-write for job {job_id}: {e}")

def set_failed(job_id: str, error: str):
    key = f"job:{job_id}"
    r.hset(key, mapping={"status": "failed", "error": error})
    r.hdel(key, "processed", "total", "current")
    r.expire(key, JOB_TTL_S)
    
    # Dual-write to Supabase for persistence
    if save_search_result:
        try:
            # Get client_id and params from Redis
            job_data = get_job(job_id)
            if job_data:
                client_id = job_data.get("client_id")
                params_str = job_data.get("params")
                if client_id and params_str:
                    try:
                        params = json.loads(params_str) if isinstance(params_str, str) else params_str
                        # Save error as result payload
                        error_payload = {"error": error}
                        save_search_result(job_id, client_id, params, error_payload, "failed")
                    except Exception as e:
                        # Log but don't fail - Redis write succeeded
                        logger.error(f"[kv_queue] Failed to write to Supabase for job {job_id}: {e}")
        except Exception as e:
            logger.error(f"[kv_queue] Error during Supabase dual-write for job {job_id}: {e}")

def set_progress(
    job_id: str,
    processed: int,
    total: int,
    city: str | None = None,
    airport: str | None = None,
    origin_airport: str | None = None,
    origin_airport_idx: int | None = None,
    origin_airport_total: int | None = None
):
    mapping = {
        "processed": str(processed),
        "total": str(total)
    }
    if city and airport:
        mapping["current"] = f"{city} ({airport})"
    # Add origin airport phase info for multi-airport searches
    if origin_airport and origin_airport_idx is not None and origin_airport_total is not None:
        mapping["origin_airport"] = origin_airport
        mapping["origin_airport_idx"] = str(origin_airport_idx)
        mapping["origin_airport_total"] = str(origin_airport_total)
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
        logger.error(f"[kv_queue] Error getting queue position: {e}")
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
        logger.error(f"[kv_queue] Error cancelling job {job_id}: {e}")
        return False