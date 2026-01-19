'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { startSearch, getJobStatus, checkHealth, SearchParams, JobStatus, SearchResult } from '@/lib/api';
import { getCountryCode, getFlagUrl } from '@/lib/country-flags';

export default function Home() {
  const [formData, setFormData] = useState<SearchParams>({
    origin: 'WRO',
    start: '',
    end: '',
    trip_length: 7,
    providers: ['ryanair', 'wizzair'],
    top_n: 5,
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
          
          // Debug: log queue position if available
          if (status.status === 'queued' && status.queue_position !== undefined) {
            console.log(`📍 Job ${status.job_id} queue position: #${status.queue_position}`);
          }
          
          if (status.status === 'done' || status.status === 'failed') {
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
    } else if (jobStatus.status === 'done' || jobStatus.status === 'failed') {
      // Ensure isSearching is false if job is already done/failed
      setIsSearching(false);
    }
  }, [jobStatus, isSearching]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSearching(true);
    setJobStatus(null);

    try {
      const response = await startSearch(formData);
      console.log('🔍 Search Job Created - Job ID:', response.job_id);
      console.log('📍 Direct API URL:', `${process.env.NEXT_PUBLIC_API_URL || 'https://holiday-destination-finder.onrender.com'}/jobs/${response.job_id}`);
      const initialStatus = await getJobStatus(response.job_id);
      setJobStatus(initialStatus);
      
      // If job is already done/failed, reset searching state
      if (initialStatus.status === 'done' || initialStatus.status === 'failed') {
        setIsSearching(false);
      }
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

  // Set default dates (first and last day of next month)
  useEffect(() => {
    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const lastDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    if (!formData.start) {
      setFormData(prev => ({
        ...prev,
        start: formatDate(nextMonth),
        end: formatDate(lastDayNextMonth),
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

        {jobStatus?.status === 'done' && jobStatus.payload?.results && (
          <ResultsDisplay results={jobStatus.payload.results} />
        )}
        
        {jobStatus?.status === 'done' && jobStatus.payload && !jobStatus.payload.results && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              No destinations found. Try adjusting your search parameters.
            </p>
          </div>
        )}
        
        {jobStatus?.status === 'failed' && jobStatus.error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Search Failed</h3>
            <p className="text-sm whitespace-pre-wrap">{jobStatus.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function JobStatusDisplay({ jobStatus }: { jobStatus: JobStatus }) {
  if (jobStatus.status === 'done' || jobStatus.status === 'failed') {
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
        {jobStatus.status === 'queued' && jobStatus.queue_position !== undefined && (
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <span className="font-medium">Queue Position: </span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              #{jobStatus.queue_position}
            </span>
            {jobStatus.queue_position === 1 && (
              <span className="ml-2 text-xs">(Next in queue)</span>
            )}
          </div>
        )}
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

  const firstResult = results[0];
  const secondRowResults = results.slice(1, 4); // Results 2, 3, 4
  const remainingResults = results.slice(4); // Results 5+

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        Top {results.length} Destinations
      </h2>
      
      <div className="space-y-6">
        {/* First result - full width */}
        {firstResult && (
          <WideDestinationCard result={firstResult} rank={1} />
        )}

        {/* Results 2, 3, 4 - row of 3 */}
        {secondRowResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {secondRowResults.map((result, index) => (
              <DestinationCard key={index + 2} result={result} rank={index + 2} />
            ))}
          </div>
        )}

        {/* Remaining results - vertical list */}
        {remainingResults.length > 0 && (
          <div className="space-y-4">
            {remainingResults.map((result, index) => (
              <ListDestinationCard key={index + 5} result={result} rank={index + 5} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DestinationCard({ result, rank }: { result: SearchResult; rank: number }) {
  const countryCode = getCountryCode(result.country);
  const flagUrl = getFlagUrl(countryCode, 'w2560');

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 overflow-hidden">
      {/* Flag background - waved trapezoid, attached on left */}
      <div className="absolute -left-8 top-0 bottom-0 w-44 opacity-30 dark:opacity-18 pointer-events-none" style={{ overflow: 'visible' }}>
        <div 
          className="w-full h-full relative"
          style={{
            maskImage: 'linear-gradient(to right, black 0%, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 85%, transparent 100%)',
          }}
        >
          <div
            className="absolute"
            style={{
              background: `url(${flagUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              clipPath: 'polygon(0 0, 85% 0, 100% 100%, 0 100%)',
              WebkitClipPath: 'polygon(0 0, 85% 0, 100% 100%, 0 100%)',
              filter: 'blur(0px)',
              width: '120%',
              height: '100%',
              top: '0%',
              left: '14%',
              maskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
            }}
          />
        </div>
      </div>

      <div className="relative z-10">
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
            <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
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
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              <div>✈️ Departure: {new Date(result.best_departure).toLocaleDateString()}</div>
              <div>🔄 Return: {new Date(result.best_return).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WideDestinationCard({ result, rank }: { result: SearchResult; rank: number }) {
  const countryCode = getCountryCode(result.country);
  const flagUrl = getFlagUrl(countryCode, 'w2560');

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 overflow-hidden">
      {/* Flag background - waved trapezoid, attached on left */}
      <div className="absolute -left-16 top-0 bottom-0 w-64 opacity-30 dark:opacity-18 pointer-events-none" style={{ overflow: 'visible' }}>
        <div 
          className="w-full h-full relative"
          style={{
            maskImage: 'linear-gradient(to right, black 0%, black 80%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 80%, transparent 100%)',
          }}
        >
          <div
            className="absolute"
            style={{
              background: `url(${flagUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              clipPath: 'polygon(0 0, 80% 0, 95% 100%, 0 100%)',
              WebkitClipPath: 'polygon(0 0, 80% 0, 95% 100%, 0 100%)',
              filter: 'blur(0px)',
              width: '125%',
              height: '100%',
              top: '0%',
              left: '0%',
              maskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
            }}
          />
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                #{rank}
              </span>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {result.city}
                </h3>
                <p className="text-base text-gray-600 dark:text-gray-400">
                  {result.country} ({result.airport})
                </p>
              </div>
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
              {result.currency} {result.flight_price.toFixed(2)}
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              Score: {result.score.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">🌡️ Temperature</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base">
              {result.avg_temp_c.toFixed(1)}°C
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">🌧️ Rainfall</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base">
              {result.avg_precip_mm_per_day.toFixed(2)} mm/day
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">✈️ Stops</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base">
              {result.total_stops === 0 ? 'Direct' : `${result.total_stops} stop(s)`}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">🛫 Airline</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base truncate block">
              {result.airlines}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-6 text-base font-semibold text-gray-900 dark:text-white">
            <div>
              ✈️ Departure: <span className="text-indigo-600 dark:text-indigo-400">{new Date(result.best_departure).toLocaleDateString()}</span>
            </div>
            <div>
              🔄 Return: <span className="text-indigo-600 dark:text-indigo-400">{new Date(result.best_return).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListDestinationCard({ result, rank }: { result: SearchResult; rank: number }) {
  const countryCode = getCountryCode(result.country);
  const flagUrl = getFlagUrl(countryCode, 'w2560');

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 overflow-hidden">
      {/* Flag background - circular icon for position 5+, fills height */}
      <div className="absolute -left-6 top-0 bottom-0 w-32 opacity-30 dark:opacity-18 pointer-events-none" style={{ overflow: 'visible' }}>
        <div 
          className="w-full h-full relative"
          style={{
            maskImage: 'linear-gradient(to right, black 0%, black 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 88%, transparent 100%)',
          }}
        >
          <div
            className="absolute"
            style={{
              background: `url(${flagUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              filter: 'blur(0px)',
              width: '100%',
              height: '100%',
              top: '0%',
              left: '6%',
              borderRadius: '0 0 0 0',
              maskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
            }}
          />
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400 min-w-[3rem]">
            #{rank}
          </span>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {result.city}, {result.country}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {result.airport} • 🌡️ {result.avg_temp_c.toFixed(1)}°C • 🌧️ {result.avg_precip_mm_per_day.toFixed(2)}mm/day
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 ml-4">
          <div className="text-right">
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {result.currency} {result.flight_price.toFixed(2)}
            </div>
            <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              Score: {result.score.toFixed(1)}
            </div>
          </div>
          
          <div className="text-right min-w-[140px]">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              <div>✈️ {new Date(result.best_departure).toLocaleDateString()}</div>
              <div>🔄 {new Date(result.best_return).toLocaleDateString()}</div>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {result.total_stops === 0 ? 'Direct' : `${result.total_stops} stop(s)`} • {result.airlines}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
