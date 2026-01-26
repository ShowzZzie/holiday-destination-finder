// API client for Holiday Destination Finder backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://holiday-destination-finder.onrender.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

// Common headers for authenticated requests
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
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
