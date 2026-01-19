'use client';

import { useState, useEffect } from 'react';
import { startSearch, getJobStatus, checkHealth, SearchParams, JobStatus, SearchResult } from '@/lib/api';

export default function Home() {
  const [formData, setFormData] = useState<SearchParams>({
    origin: 'WRO',
    start: '',
    end: '',
    trip_length: 7,
    providers: ['ryanair', 'wizzair'],
    top_n: 10,
  });
  
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiHealthy, setIsApiHealthy] = useState<boolean | null>(null);

  // Check API health on mount
  useEffect(() => {
    checkHealth().then(setIsApiHealthy);
  }, []);

  // Poll job status when job is active
  useEffect(() => {
    if (!jobStatus || !isSearching) return;
    
    if (jobStatus.status === 'queued' || jobStatus.status === 'running') {
      const interval = setInterval(async () => {
        try {
          const status = await getJobStatus(jobStatus.job_id);
          setJobStatus(status);
          
          if (status.status === 'completed' || status.status === 'failed') {
            setIsSearching(false);
            clearInterval(interval);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to poll job status');
          setIsSearching(false);
          clearInterval(interval);
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [jobStatus, isSearching]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSearching(true);
    setJobStatus(null);

    try {
      const response = await startSearch(formData);
      const initialStatus = await getJobStatus(response.job_id);
      setJobStatus(initialStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start search');
      setIsSearching(false);
    }
  };

  const handleProviderChange = (provider: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      providers: checked
        ? [...prev.providers, provider]
        : prev.providers.filter(p => p !== provider),
    }));
  };

  // Set default dates (today + 30 days for start, +37 for end)
  useEffect(() => {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + 30);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 60);

    if (!formData.start) {
      setFormData(prev => ({
        ...prev,
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      }));
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            ✈️ Holiday Destination Finder
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Discover the perfect holiday destination based on flight prices and weather
          </p>
          {isApiHealthy === false && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg inline-block">
              ⚠️ API server is not reachable. Please ensure the backend is running.
            </div>
          )}
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="origin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Origin Airport (IATA)
                </label>
                <input
                  type="text"
                  id="origin"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  placeholder="WRO"
                  maxLength={3}
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  id="start"
                  value={formData.start}
                  onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  id="end"
                  value={formData.end}
                  onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="trip_length" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trip Length (days)
                </label>
                <input
                  type="number"
                  id="trip_length"
                  value={formData.trip_length}
                  onChange={(e) => setFormData({ ...formData, trip_length: parseInt(e.target.value) || 7 })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  min="1"
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="top_n" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Top N Results
                </label>
                <input
                  type="number"
                  id="top_n"
                  value={formData.top_n}
                  onChange={(e) => setFormData({ ...formData, top_n: parseInt(e.target.value) || 10 })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  min="1"
                  max="50"
                  required
                  disabled={isSearching}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Flight Providers
              </label>
              <div className="flex flex-wrap gap-4">
                {['ryanair', 'wizzair', 'amadeus'].map(provider => (
                  <label key={provider} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.providers.includes(provider)}
                      onChange={(e) => handleProviderChange(provider, e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      disabled={isSearching}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                      {provider}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSearching || formData.providers.length === 0}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {isSearching ? 'Searching...' : 'Search Destinations'}
            </button>
          </form>
        </div>

        {jobStatus && (
          <JobStatusDisplay jobStatus={jobStatus} />
        )}

        {jobStatus?.status === 'completed' && jobStatus.payload && (
          <ResultsDisplay results={jobStatus.payload} />
        )}
      </div>
    </div>
  );
}

function JobStatusDisplay({ jobStatus }: { jobStatus: JobStatus }) {
  if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
    return null;
  }

  const progress = jobStatus.total && jobStatus.processed
    ? Math.round((jobStatus.processed / jobStatus.total) * 100)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Search Progress
      </h2>
      <div className="space-y-3">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Status: <span className="font-medium capitalize">{jobStatus.status}</span></span>
          {jobStatus.total && jobStatus.processed !== undefined && (
            <span>
              {jobStatus.processed} / {jobStatus.total} destinations
            </span>
          )}
        </div>
        {jobStatus.total && jobStatus.processed !== undefined && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {jobStatus.current && (
          <p className="text-sm text-gray-600 dark:text-gray-400 italic">
            Processing: {jobStatus.current}
          </p>
        )}
      </div>
    </div>
  );
}

function ResultsDisplay({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <p className="text-gray-600 dark:text-gray-400 text-center">
          No destinations found. Try adjusting your search parameters.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        Top {results.length} Destinations
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {results.map((result, index) => (
          <DestinationCard key={index} result={result} rank={index + 1} />
        ))}
      </div>
    </div>
  );
}

function DestinationCard({ result, rank }: { result: SearchResult; rank: number }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              #{rank}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {result.city}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {result.country} ({result.airport})
              </p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {result.currency} {result.flight_price.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Score: {result.score.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">🌡️ Temperature</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {result.avg_temp_c.toFixed(1)}°C
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">🌧️ Rainfall</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {result.avg_precip_mm_per_day.toFixed(2)} mm/day
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">✈️ Stops</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {result.total_stops === 0 ? 'Direct' : `${result.total_stops} stop(s)`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">🛫 Airline</span>
          <span className="font-medium text-gray-900 dark:text-white text-right max-w-[60%] truncate">
            {result.airlines}
          </span>
        </div>
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <div>Departure: {new Date(result.best_departure).toLocaleDateString()}</div>
            <div>Return: {new Date(result.best_return).toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
