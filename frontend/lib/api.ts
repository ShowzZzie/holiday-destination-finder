// API client for Holiday Destination Finder backend

import { getClientId } from './client-id';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://holiday-destination-finder.onrender.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

// Common headers for authenticated requests
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  // Add client ID header for user identification
  try {
    const clientId = getClientId();
    if (clientId && clientId !== 'server-side') {
      headers['X-Client-ID'] = clientId;
    }
  } catch (e) {
    // Silently fail if client ID can't be retrieved
    console.warn('Failed to get client ID:', e);
  }
  return headers;
}

export interface SearchParams {
  origin: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  trip_length: number;
  providers: string[];
  top_n: number;
}

export interface SearchResult {
  city: string;
  country: string;
  airport: string;
  origin_airport?: string;  // Departure airport that found this flight
  avg_temp_c: number;
  avg_precip_mm_per_day: number;
  flight_price: number;
  currency: string;
  total_stops: number;
  airlines: string;
  best_departure: string;
  best_return: string;
  score: number;
}

export interface JobResponse {
  job_id: string;
}

export interface JobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  queue_position?: number;
  processed?: number;
  total?: number;
  current?: string;
  // Multi-airport origin progress
  origin_airport?: string;
  origin_airport_idx?: number;
  origin_airport_total?: number;
  payload?: {
    meta?: any;
    results?: SearchResult[];
  };
  error?: string;
  custom_name?: string;  // User-defined custom name
  params?: {
    origin?: string;
    start?: string;
    end?: string;
    trip_length?: number;
    providers?: string[];
    top_n?: number;
  };
}

export async function startSearch(params: SearchParams): Promise<JobResponse> {
  const searchParams = new URLSearchParams({
    origin: params.origin,
    start: params.start,
    end: params.end,
    trip_length: params.trip_length.toString(),
    top_n: params.top_n.toString(),
  });

  // Add providers as multiple query params
  params.providers.forEach(provider => {
    searchParams.append('providers', provider);
  });

  const response = await fetch(`${API_BASE_URL}/search?${searchParams.toString()}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start search: ${error}`);
  }

  return response.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Job not found');
    }
    const error = await response.text();
    throw new Error(`Failed to get job status: ${error}`);
  }

  return response.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function cancelJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to cancel job: ${error}`);
  }
}

export interface ResolveDepartureResponse {
  airport: string | null;
  source?: string;
  error?: string;
}

export interface GoogleFlightsUrlResponse {
  url: string | null;
  origin?: string;
  source?: string;
  resolved_airport?: string | null;
  error?: string;
}

/**
 * Resolve the cheapest departure airport when searching from a country/city umbrella.
 * Uses headless browser to load Google Flights and extract the suggested cheaper airport.
 */
export async function resolveDepartureAirport(
  origin: string,
  destination: string,
  departure: string,
  returnDate: string
): Promise<ResolveDepartureResponse> {
  const params = new URLSearchParams({
    origin,
    destination,
    departure,
    return: returnDate,
  });

  const response = await fetch(`${API_BASE_URL}/resolve-departure?${params.toString()}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to resolve departure airport: ${error}`);
  }

  return response.json();
}

export async function getGoogleFlightsUrl(params: {
  origin: string;
  destination: string;
  departure: string;
  returnDate: string;
  resolve?: boolean;
}): Promise<GoogleFlightsUrlResponse> {
  const searchParams = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    departure: params.departure,
    return: params.returnDate,
  });

  if (params.resolve !== undefined) {
    searchParams.set('resolve', params.resolve ? 'true' : 'false');
  }

  const response = await fetch(`${API_BASE_URL}/google-flights-url?${searchParams.toString()}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Google Flights URL: ${error}`);
  }

  return response.json();
}

/**
 * Get searches for the current user from Supabase.
 * 
 * @param type - 'personal' for user's own searches, 'shared' for saved searches
 * @returns List of job statuses
 */
export async function getMySearches(type: 'personal' | 'shared' = 'personal'): Promise<JobStatus[]> {
  const params = new URLSearchParams({
    type,
  });

  const response = await fetch(`${API_BASE_URL}/jobs?${params.toString()}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get searches: ${error}`);
  }

  return response.json();
}

/**
 * Save a shared search to user's saved list.
 * 
 * @param jobId - Job ID to save
 */
export async function saveSearch(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/save`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save search: ${error}`);
  }
}

/**
 * Remove a search from user's saved list.
 * 
 * @param jobId - Job ID to unsave
 */
export async function unsaveSearch(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/unsave`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to unsave search: ${error}`);
  }
}

/**
 * Check if a search is saved by the current user.
 * 
 * @param jobId - Job ID to check
 * @returns True if saved, false otherwise
 */
export async function isSearchSaved(jobId: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/saved`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    // If endpoint fails, assume not saved
    return false;
  }

  const data = await response.json();
  return data.saved === true;
}

/**
 * Rename a search.
 * 
 * @param jobId - Job ID to rename
 * @param customName - New custom name (null to remove custom name and use default)
 * @param isSaved - If true, update custom_name in saved_searches (for shared queries). If false, update in search_results (only for own searches)
 */
export async function renameSearch(jobId: string, customName: string | null, isSaved: boolean = false): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/name`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ custom_name: customName, is_saved: isSaved }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to rename search: ${error}`);
  }
}

/**
 * Hide a search from Personal tab (soft delete).
 * 
 * @param jobId - Job ID to hide
 */
export async function hideSearch(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/hide`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to hide search: ${error}`);
  }
}

/**
 * Unhide a search from Personal tab.
 * 
 * @param jobId - Job ID to unhide
 */
export async function unhideSearch(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/unhide`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to unhide search: ${error}`);
  }
}

/**
 * Delete a saved search from Shared tab (soft delete).
 * 
 * @param jobId - Job ID to delete
 */
export async function deleteSavedSearch(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/delete`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete saved search: ${error}`);
  }
}

/**
 * Get shareable URL for a job.
 * 
 * @param jobId - Job ID
 * @returns Shareable URL
 */
export function getShareableJobUrl(jobId: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return `${window.location.origin}/?jobId=${jobId}`;
}
