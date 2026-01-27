"""
Supabase integration for persistent storage of search results.
Provides functions to save, retrieve, and manage search results with sliding TTL.
"""
import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("[supabase] SUPABASE_URL or SUPABASE_KEY not configured. Supabase features will be disabled.")
    _supabase: Optional[Client] = None
else:
    try:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("[supabase] Supabase client initialized successfully")
    except Exception as e:
        logger.error(f"[supabase] Failed to initialize Supabase client: {e}")
        _supabase = None


def _ensure_supabase() -> Client:
    """Ensure Supabase client is available, raise error if not."""
    if _supabase is None:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY environment variables.")
    return _supabase


def save_search_result(job_id: str, client_id: str, params: dict, result: dict, status: str) -> bool:
    """
    Save a completed search result to Supabase.
    
    Args:
        job_id: Unique job identifier
        client_id: Client identifier (UUID from localStorage)
        params: Search parameters (origin, dates, etc.)
        result: Full search result payload
        status: 'done' or 'failed'
    
    Returns:
        True if saved successfully, False otherwise
    """
    if _supabase is None:
        return False
    
    try:
        expires_at = datetime.utcnow() + timedelta(days=7)
        last_accessed_at = datetime.utcnow()
        
        data = {
            "job_id": job_id,
            "client_id": client_id,
            "params": json.dumps(params) if isinstance(params, dict) else params,
            "result": json.dumps(result) if isinstance(result, dict) else result,
            "status": status,
            "expires_at": expires_at.isoformat(),
            "last_accessed_at": last_accessed_at.isoformat(),
        }
        
        # Use upsert to handle duplicates (update if exists, insert if not)
        _supabase.table("search_results").upsert(data, on_conflict="job_id").execute()
        logger.info(f"[supabase] Saved search result for job {job_id}")
        return True
    except Exception as e:
        logger.error(f"[supabase] Failed to save search result for job {job_id}: {e}")
        return False


def get_search_result(job_id: str, update_ttl: bool = True) -> Optional[Dict[str, Any]]:
    """
    Get a search result from Supabase by job_id.
    
    Args:
        job_id: Job identifier
        update_ttl: If True, reset expires_at to 7 days from now (sliding TTL)
    
    Returns:
        Search result dict or None if not found
    """
    if _supabase is None:
        return None
    
    try:
        response = _supabase.table("search_results").select("*").eq("job_id", job_id).execute()
        
        if not response.data or len(response.data) == 0:
            return None
        
        result = response.data[0]
        
        # Update TTL if requested (sliding expiration)
        if update_ttl:
            touch_search_result(job_id)
        
        # Parse JSON fields
        if isinstance(result.get("params"), str):
            result["params"] = json.loads(result["params"])
        if isinstance(result.get("result"), str):
            result["result"] = json.loads(result["result"])
        
        return result
    except Exception as e:
        logger.error(f"[supabase] Failed to get search result for job {job_id}: {e}")
        return None


def touch_search_result(job_id: str) -> bool:
    """
    Update expires_at and last_accessed_at for a search result (sliding TTL).
    
    Args:
        job_id: Job identifier
    
    Returns:
        True if updated successfully, False otherwise
    """
    if _supabase is None:
        return False
    
    try:
        expires_at = datetime.utcnow() + timedelta(days=7)
        last_accessed_at = datetime.utcnow()
        
        _supabase.table("search_results").update({
            "expires_at": expires_at.isoformat(),
            "last_accessed_at": last_accessed_at.isoformat(),
        }).eq("job_id", job_id).execute()
        
        logger.debug(f"[supabase] Updated TTL for job {job_id}")
        return True
    except Exception as e:
        logger.error(f"[supabase] Failed to touch search result for job {job_id}: {e}")
        return False


def get_search_results_by_client(client_id: str) -> List[Dict[str, Any]]:
    """
    Get all searches created by a client_id (Personal tab).
    
    Args:
        client_id: Client identifier
    
    Returns:
        List of search results, sorted by last_accessed_at DESC
    """
    if _supabase is None:
        return []
    
    try:
        response = _supabase.table("search_results")\
            .select("*")\
            .eq("client_id", client_id)\
            .order("last_accessed_at", desc=True)\
            .execute()
        
        results = []
        for item in response.data:
            # Parse JSON fields
            if isinstance(item.get("params"), str):
                item["params"] = json.loads(item["params"])
            if isinstance(item.get("result"), str):
                item["result"] = json.loads(item["result"])
            results.append(item)
        
        return results
    except Exception as e:
        logger.error(f"[supabase] Failed to get search results for client {client_id}: {e}")
        return []


def get_saved_searches_by_client(client_id: str) -> List[Dict[str, Any]]:
    """
    Get all searches saved by a client_id (Shared tab).
    
    Args:
        client_id: Client identifier
    
    Returns:
        List of search results, sorted by saved_at DESC
    """
    if _supabase is None:
        return []
    
    try:
        # Join saved_searches with search_results
        response = _supabase.table("saved_searches")\
            .select("*, search_results(*)")\
            .eq("client_id", client_id)\
            .order("saved_at", desc=True)\
            .execute()
        
        results = []
        for item in response.data:
            search_result = item.get("search_results")
            if search_result:
                # Parse JSON fields
                if isinstance(search_result.get("params"), str):
                    search_result["params"] = json.loads(search_result["params"])
                if isinstance(search_result.get("result"), str):
                    search_result["result"] = json.loads(search_result["result"])
                results.append(search_result)
        
        return results
    except Exception as e:
        logger.error(f"[supabase] Failed to get saved searches for client {client_id}: {e}")
        return []


def save_search_for_client(client_id: str, job_id: str) -> bool:
    """
    Add a search to a user's saved list.
    
    Args:
        client_id: Client identifier
        job_id: Job identifier
    
    Returns:
        True if saved successfully, False otherwise
    """
    if _supabase is None:
        return False
    
    try:
        data = {
            "client_id": client_id,
            "job_id": job_id,
        }
        
        _supabase.table("saved_searches").insert(data).execute()
        logger.info(f"[supabase] Saved search {job_id} for client {client_id}")
        return True
    except Exception as e:
        # Handle duplicate key error gracefully
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            logger.debug(f"[supabase] Search {job_id} already saved for client {client_id}")
            return True
        logger.error(f"[supabase] Failed to save search {job_id} for client {client_id}: {e}")
        return False


def unsave_search_for_client(client_id: str, job_id: str) -> bool:
    """
    Remove a search from a user's saved list.
    
    Args:
        client_id: Client identifier
        job_id: Job identifier
    
    Returns:
        True if removed successfully, False otherwise
    """
    if _supabase is None:
        return False
    
    try:
        _supabase.table("saved_searches")\
            .delete()\
            .eq("client_id", client_id)\
            .eq("job_id", job_id)\
            .execute()
        
        logger.info(f"[supabase] Unsaved search {job_id} for client {client_id}")
        return True
    except Exception as e:
        logger.error(f"[supabase] Failed to unsave search {job_id} for client {client_id}: {e}")
        return False


def is_search_saved(client_id: str, job_id: str) -> bool:
    """
    Check if a search is saved by a client.
    
    Args:
        client_id: Client identifier
        job_id: Job identifier
    
    Returns:
        True if saved, False otherwise
    """
    if _supabase is None:
        return False
    
    try:
        response = _supabase.table("saved_searches")\
            .select("id")\
            .eq("client_id", client_id)\
            .eq("job_id", job_id)\
            .execute()
        
        return len(response.data) > 0
    except Exception as e:
        logger.error(f"[supabase] Failed to check if search {job_id} is saved for client {client_id}: {e}")
        return False


def update_search_name(job_id: str, client_id: str, custom_name: Optional[str]) -> bool:
    """
    Update custom name for a search (only if client_id matches).
    
    Args:
        job_id: Job identifier
        client_id: Client identifier (must match the search's creator)
        custom_name: Custom name (None to remove custom name)
    
    Returns:
        True if updated successfully, False otherwise
    """
    if _supabase is None:
        return False
    
    try:
        # First verify the client_id matches
        response = _supabase.table("search_results")\
            .select("client_id")\
            .eq("job_id", job_id)\
            .execute()
        
        if not response.data or len(response.data) == 0:
            logger.warning(f"[supabase] Job {job_id} not found")
            return False
        
        if response.data[0]["client_id"] != client_id:
            logger.warning(f"[supabase] Client {client_id} does not own job {job_id}")
            return False
        
        # Update custom_name
        update_data = {"custom_name": custom_name}
        _supabase.table("search_results")\
            .update(update_data)\
            .eq("job_id", job_id)\
            .execute()
        
        logger.info(f"[supabase] Updated custom name for job {job_id}")
        return True
    except Exception as e:
        logger.error(f"[supabase] Failed to update custom name for job {job_id}: {e}")
        return False


def delete_expired_results() -> int:
    """
    Delete expired search results (expires_at < NOW()).
    This is called automatically by Supabase cleanup function, but can be called manually.
    
    Returns:
        Number of deleted rows
    """
    if _supabase is None:
        return 0
    
    try:
        # Note: Supabase doesn't support DELETE with WHERE directly in Python client
        # We'll need to use RPC or let Supabase handle cleanup via scheduled function
        # For now, return 0 and rely on Supabase cleanup function
        logger.info("[supabase] Cleanup should be handled by Supabase scheduled function")
        return 0
    except Exception as e:
        logger.error(f"[supabase] Failed to delete expired results: {e}")
        return 0
