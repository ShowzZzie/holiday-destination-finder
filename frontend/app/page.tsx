'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { startSearch, getJobStatus, checkHealth, cancelJob, SearchParams, JobStatus, SearchResult } from '@/lib/api';
import { getCountryCode, getFlagUrl, getRegion, ALL_REGIONS, Region } from '@/lib/country-flags';
import { useLanguage } from '@/app/contexts/LanguageContext';

// Helper function to get airline logo URL
function getAirlineLogoUrl(airlineName: string): string | null {
  const normalized = airlineName.toLowerCase();
  if (normalized.includes('ryanair') || normalized.includes('fr')) {
    // Ryanair logo from SimpleIcons or a CDN
    return 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/ryanair.svg';
  }
  if (normalized.includes('wizz') || normalized.includes('w6')) {
    // Wizz Air logo from SimpleIcons or a CDN
    return 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/wizzair.svg';
  }
  return null;
}

// Component to render airline name with optional logo
function AirlineDisplay({ airlines }: { airlines: string }) {
  const logoUrl = getAirlineLogoUrl(airlines);
  
  if (logoUrl) {
    return (
      <span className="flex items-center gap-1.5">
        <Image 
          src={logoUrl}
          alt={airlines}
          width={16}
          height={16}
          className="inline-block"
          style={{ filter: 'invert(1)', opacity: 0.8 }}
        />
        <span>{airlines}</span>
      </span>
    );
  }
  
  return <span>{airlines}</span>;
}

export default function Home() {
  const { t } = useLanguage();
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
  const [jobHistory, setJobHistory] = useState<Array<{ jobId: string; origin: string; start: string; end: string; trip_length?: number; providers?: string[]; top_n?: number }>>([]);
  const [validJobIds, setValidJobIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recentlyCreatedJobIds, setRecentlyCreatedJobIds] = useState<Set<string>>(new Set());
  // Track the last viewed job's form parameters
  const [lastViewedParams, setLastViewedParams] = useState<SearchParams | null>(null);
  // Local state for number inputs to allow empty values during typing
  const [tripLengthInput, setTripLengthInput] = useState<string>('7');
  const [topNInput, setTopNInput] = useState<string>('5');

  // Check API health on mount
  useEffect(() => {
    checkHealth().then(setIsApiHealthy);
  }, []);

  // Load job history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('jobHistory');
    if (saved) {
      try {
        const history = JSON.parse(saved);
        setJobHistory(history);
        // Validate all jobs on mount
        validateJobs(history);
      } catch (e) {
        console.error('Failed to parse job history:', e);
      }
    }
  }, []);

  // Validate jobs by checking if they exist
  const validateJobs = async (jobs: Array<{ jobId: string; origin: string; start: string; end: string }>) => {
    const validIds = new Set<string>();
    await Promise.all(
      jobs.map(async (job) => {
        try {
          await getJobStatus(job.jobId);
          validIds.add(job.jobId);
        } catch (err) {
          // Job not found (404) or other error - exclude from valid set
          console.log(`Job ${job.jobId} not found, removing from sidebar`);
        }
      })
    );
    setValidJobIds(validIds);
  };

  // Save job ID with metadata to history when a new job is created (not when selecting existing job)
  useEffect(() => {
    // Only add to history if this is a newly created job (not just selected)
    if (jobStatus?.job_id && recentlyCreatedJobIds.has(jobStatus.job_id)) {
      if (jobStatus?.payload?.meta) {
        const meta = jobStatus.payload.meta;
        setJobHistory(prev => {
          // Check if job already exists in history
          const exists = prev.some(item => item.jobId === jobStatus.job_id);
          if (exists) {
            // Job already in history, don't reorder - just update metadata if needed
            return prev.map(item =>
              item.jobId === jobStatus.job_id
                ? { ...item, origin: meta.origin || item.origin, start: meta.start || item.start, end: meta.end || item.end, trip_length: formData.trip_length, providers: formData.providers, top_n: formData.top_n }
                : item
            );
          }
          // New job - add to front
          const newEntry = {
            jobId: jobStatus.job_id,
            origin: meta.origin || 'N/A',
            start: meta.start || 'N/A',
            end: meta.end || 'N/A',
            trip_length: formData.trip_length,
            providers: formData.providers,
            top_n: formData.top_n,
          };
          const updated = [
            newEntry,
            ...prev.filter(item => item.jobId !== jobStatus.job_id)
          ].slice(0, 20);
          localStorage.setItem('jobHistory', JSON.stringify(updated));
          return updated;
        });
      } else if (formData.origin && formData.start && formData.end) {
        // Fallback: use current form data if meta is not available yet
        setJobHistory(prev => {
          // Check if job already exists in history
          const exists = prev.some(item => item.jobId === jobStatus.job_id);
          if (exists) {
            // Job already in history, don't reorder
            return prev;
          }
          // New job - add to front
          const newEntry = {
            jobId: jobStatus.job_id,
            origin: formData.origin,
            start: formData.start,
            end: formData.end,
            trip_length: formData.trip_length,
            providers: formData.providers,
            top_n: formData.top_n,
          };
          const updated = [
            newEntry,
            ...prev.filter(item => item.jobId !== jobStatus.job_id)
          ].slice(0, 20);
          localStorage.setItem('jobHistory', JSON.stringify(updated));
          return updated;
        });
      }
      // Remove from recently created set after processing
      setRecentlyCreatedJobIds(prev => {
        const updated = new Set(prev);
        updated.delete(jobStatus.job_id);
        return updated;
      });
    }
  }, [jobStatus?.job_id, jobStatus?.payload?.meta, formData, recentlyCreatedJobIds]);

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
      
      // Mark this as a newly created job
      setRecentlyCreatedJobIds(prev => new Set([...prev, response.job_id]));
      
      // Save to history immediately with form data
      setJobHistory(prev => {
        const newEntry = {
          jobId: response.job_id,
          origin: formData.origin,
          start: formData.start,
          end: formData.end,
          trip_length: formData.trip_length,
          providers: formData.providers,
          top_n: formData.top_n,
        };
        const updated = [
          newEntry,
          ...prev.filter(item => item.jobId !== response.job_id)
        ].slice(0, 20); // Keep last 20
        localStorage.setItem('jobHistory', JSON.stringify(updated));
        // Mark this job as valid
        setValidJobIds(prev => new Set([...prev, response.job_id]));
        return updated;
      });

      // Track as last viewed params
      setLastViewedParams(formData);
      
      const initialStatus = await getJobStatus(response.job_id);
      setJobStatus(initialStatus);
      setSelectedJobId(response.job_id);
      
      // If job is already done/failed, reset searching state
      if (initialStatus.status === 'done' || initialStatus.status === 'failed') {
        setIsSearching(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start search');
      setIsSearching(false);
    }
  };

  const handleJobSelect = async (jobId: string) => {
    setSelectedJobId(jobId);
    setError(null);

    // Find the job in history to get its parameters
    const job = jobHistory.find(j => j.jobId === jobId);
    if (job) {
      const jobParams: SearchParams = {
        origin: job.origin,
        start: job.start,
        end: job.end,
        trip_length: job.trip_length ?? formData.trip_length,
        providers: job.providers ?? formData.providers,
        top_n: job.top_n ?? formData.top_n,
      };
      // Track as last viewed params
      setLastViewedParams(jobParams);
      // Also update the form to show these params
      setFormData(jobParams);
      setTripLengthInput(jobParams.trip_length.toString());
      setTopNInput(jobParams.top_n.toString());
    }

    try {
      const status = await getJobStatus(jobId);
      setJobStatus(status);
      setIsSearching(status.status === 'queued' || status.status === 'running');
      // Ensure job is marked as valid
      setValidJobIds(prev => new Set([...prev, jobId]));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load job status';
      // If job not found, remove from valid set and update history
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        setValidJobIds(prev => {
          const updated = new Set(prev);
          updated.delete(jobId);
          return updated;
        });
        // Remove from job history
        setJobHistory(prev => {
          const updated = prev.filter(item => item.jobId !== jobId);
          localStorage.setItem('jobHistory', JSON.stringify(updated));
          return updated;
        });
        if (selectedJobId === jobId) {
          setJobStatus(null);
          setSelectedJobId(null);
        }
      } else {
        setError(errorMessage);
        setJobStatus(null);
      }
    }
  };

  const handleJobReorder = (newOrder: Array<{ jobId: string; origin: string; start: string; end: string; trip_length?: number; providers?: string[]; top_n?: number }>) => {
    setJobHistory(newOrder);
    localStorage.setItem('jobHistory', JSON.stringify(newOrder));
  };

  const handleNewSearch = () => {
    // Clear current job selection
    setSelectedJobId(null);
    setJobStatus(null);
    setError(null);
    setIsSearching(false);

    // Use last viewed params if available, otherwise keep current form
    if (lastViewedParams) {
      setFormData(lastViewedParams);
      setTripLengthInput(lastViewedParams.trip_length.toString());
      setTopNInput(lastViewedParams.top_n.toString());
    }
  };

  const handleCancelJob = async () => {
    if (!jobStatus?.job_id) return;
    
    try {
      await cancelJob(jobStatus.job_id);
      // Refresh job status to see cancellation
      const updatedStatus = await getJobStatus(jobStatus.job_id);
      setJobStatus(updatedStatus);
      setIsSearching(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex">
      {/* Sidebar */}
      <JobHistorySidebar
        jobHistory={jobHistory}
        validJobIds={validJobIds}
        selectedJobId={selectedJobId}
        onJobSelect={handleJobSelect}
        onReorder={handleJobReorder}
        onNewSearch={handleNewSearch}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      
      {/* Main Content */}
      <div className="flex-1 container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-6xl">
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {t('title')}
          </h1>
          <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-300 px-4">
            {t('subtitle')}
          </p>
          {isApiHealthy === false && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg inline-block text-sm">
              {t('apiUnreachable')}
            </div>
          )}
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 mb-6 sm:mb-8">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="origin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('origin')}
                </label>
                <input
                  type="text"
                  id="origin"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 autofill:bg-white autofill:text-gray-900"
                  placeholder="WRO"
                  maxLength={3}
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('startDate')}
                </label>
                <input
                  type="date"
                  id="start"
                  value={formData.start}
                  onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('endDate')}
                </label>
                <input
                  type="date"
                  id="end"
                  value={formData.end}
                  onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="trip_length" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('tripLength')}
                </label>
                <input
                  type="number"
                  id="trip_length"
                  value={tripLengthInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTripLengthInput(val);
                    // Update formData if valid number
                    const num = parseInt(val);
                    if (val !== '' && !isNaN(num) && num > 0) {
                      setFormData({ ...formData, trip_length: num });
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const val = e.target.value;
                    const num = parseInt(val);
                    // If empty or invalid on blur, set to default
                    if (val === '' || isNaN(num) || num <= 0) {
                      const defaultValue = 7;
                      setTripLengthInput(defaultValue.toString());
                      setFormData({ ...formData, trip_length: defaultValue });
                    } else {
                      // Ensure formData is synced
                      setFormData({ ...formData, trip_length: num });
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                  min="1"
                  required
                  disabled={isSearching}
                />
              </div>

              <div>
                <label htmlFor="top_n" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('topN')}
                </label>
                <input
                  type="number"
                  id="top_n"
                  value={topNInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTopNInput(val);
                    // Update formData if valid number
                    const num = parseInt(val);
                    if (val !== '' && !isNaN(num) && num > 0) {
                      setFormData({ ...formData, top_n: num });
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const val = e.target.value;
                    const num = parseInt(val);
                    // If empty or invalid on blur, set to default
                    if (val === '' || isNaN(num) || num <= 0) {
                      const defaultValue = 5;
                      setTopNInput(defaultValue.toString());
                      setFormData({ ...formData, top_n: defaultValue });
                    } else {
                      // Ensure formData is synced
                      setFormData({ ...formData, top_n: num });
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                  min="1"
                  max="50"
                  required
                  disabled={isSearching}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('flightProviders')}
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
              {isSearching ? t('searching') : t('searchDestinations')}
            </button>
          </form>
        </div>

        {jobStatus && (
          <JobStatusDisplay jobStatus={jobStatus} onCancel={handleCancelJob} />
        )}

        {jobStatus?.status === 'done' && jobStatus.payload?.results && (
          <ResultsDisplay results={jobStatus.payload.results} />
        )}
        
        {jobStatus?.status === 'done' && jobStatus.payload && !jobStatus.payload.results && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              {t('noDestinations')}
            </p>
          </div>
        )}
        
        {jobStatus?.status === 'failed' && jobStatus.error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg p-4">
            <h3 className="font-semibold mb-2">{t('searchFailed')}</h3>
            <p className="text-sm whitespace-pre-wrap">{jobStatus.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function JobStatusDisplay({ jobStatus, onCancel }: { jobStatus: JobStatus; onCancel?: () => void }) {
  const { t } = useLanguage();
  
  if (jobStatus.status === 'done' || jobStatus.status === 'failed') {
    return null;
  }

  const progress = jobStatus.total && jobStatus.processed
    ? Math.round((jobStatus.processed / jobStatus.total) * 100)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t('searchProgress')}
        </h2>
        {onCancel && (jobStatus.status === 'queued' || jobStatus.status === 'running') && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="space-y-3">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{t('status')}: <span className="font-medium capitalize">{jobStatus.status}</span></span>
          {jobStatus.total && jobStatus.processed !== undefined && (
            <span>
              {jobStatus.processed} / {jobStatus.total} {t('destinations')}
            </span>
          )}
        </div>
        {jobStatus.status === 'queued' && jobStatus.queue_position !== undefined && (
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <span className="font-medium">{t('queuePosition')}: </span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              #{jobStatus.queue_position}
            </span>
            {jobStatus.queue_position === 1 && (
              <span className="ml-2 text-xs">({t('nextInQueue')})</span>
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
            {t('processing')}: {jobStatus.current}
          </p>
        )}
      </div>
    </div>
  );
}

function JobHistorySidebar({
  jobHistory,
  validJobIds,
  selectedJobId,
  onJobSelect,
  onReorder,
  onNewSearch,
  open,
  onToggle
}: {
  jobHistory: Array<{ jobId: string; origin: string; start: string; end: string; trip_length?: number; providers?: string[]; top_n?: number }>;
  validJobIds: Set<string>;
  selectedJobId: string | null;
  onJobSelect: (jobId: string) => void;
  onReorder: (newOrder: Array<{ jobId: string; origin: string; start: string; end: string; trip_length?: number; providers?: string[]; top_n?: number }>) => void;
  onNewSearch: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Filter to only show valid jobs
  const validJobs = jobHistory.filter(job => validJobIds.has(job.jobId));

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'N/A') return dateStr;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDropForValidJobs = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newOrder = [...validJobs];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    
    // Update the full job history order (maintaining valid jobs at the front)
    const invalidJobs = jobHistory.filter(job => !validJobIds.has(job.jobId));
    onReorder([...newOrder, ...invalidJobs]);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      {/* Sidebar Toggle Button - moves with sidebar */}
      <button
        onClick={onToggle}
        className={`fixed top-24 z-40 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 ${
          open ? 'left-[21rem]' : 'left-4'
        }`}
        aria-label="Toggle job history"
      >
        <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-xl z-30 transform transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('jobHistory')}</h3>
          <button
            onClick={onToggle}
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* New Search Button */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              onNewSearch();
              onToggle();
            }}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('newSearch')}
          </button>
        </div>
        <div className="flex flex-col h-[calc(100vh-8.5rem)]">
          <div className="overflow-y-auto flex-1 p-4">
            {validJobs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No job history yet
              </p>
            ) : (
              <div className="space-y-2">
                {validJobs.map((job, index) => (
                  <div
                    key={job.jobId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDropForValidJobs(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-move ${
                      draggedIndex === index ? 'opacity-50' : ''
                    } ${dragOverIndex === index ? 'border-t-2 border-indigo-500' : ''}`}
                  >
                    <button
                      onClick={() => onJobSelect(job.jobId)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedJobId === job.jobId
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
                          : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <div className="text-sm font-medium truncate">
                          {job.origin} · {formatDate(job.start)} · {formatDate(job.end)}
                        </div>
                      </div>
                      <div className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{job.jobId}</div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {jobHistory.length > validJobs.length && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Some searches are not displayed because results have expired. Please run the query again to view them.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-20"
          onClick={onToggle}
        />
      )}
    </>
  );
}

// Types for sorting and filtering
type SortField = 'score' | 'price' | 'temperature' | 'rainfall';
type SortDirection = 'asc' | 'desc';

interface Filters {
  regions: Region[];
  countries: string[];
  maxPrice: number | null;
  minTemp: number | null;
  directOnly: boolean;
}

const defaultFilters: Filters = {
  regions: [],
  countries: [],
  maxPrice: null,
  minTemp: null,
  directOnly: false,
};

function ResultsDisplay({ results }: { results: SearchResult[] }) {
  const { t } = useLanguage();
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Get unique countries and regions from results
  const availableCountries = useMemo(() => {
    const countries = [...new Set(results.map(r => r.country))];
    return countries.sort();
  }, [results]);

  const availableRegions = useMemo(() => {
    const regions = new Set<Region>();
    results.forEach(r => {
      const region = getRegion(r.country);
      if (region) regions.add(region);
    });
    return ALL_REGIONS.filter(r => regions.has(r));
  }, [results]);

  // Filter results
  const filteredResults = useMemo(() => {
    return results.filter(result => {
      // Region filter
      if (filters.regions.length > 0) {
        const resultRegion = getRegion(result.country);
        if (!resultRegion || !filters.regions.includes(resultRegion)) {
          return false;
        }
      }

      // Country filter
      if (filters.countries.length > 0 && !filters.countries.includes(result.country)) {
        return false;
      }

      // Max price filter
      if (filters.maxPrice !== null && result.flight_price > filters.maxPrice) {
        return false;
      }

      // Min temperature filter
      if (filters.minTemp !== null && result.avg_temp_c < filters.minTemp) {
        return false;
      }

      // Direct flights only
      if (filters.directOnly && result.total_stops > 0) {
        return false;
      }

      return true;
    });
  }, [results, filters]);

  // Sort results
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'price':
          comparison = a.flight_price - b.flight_price;
          break;
        case 'temperature':
          comparison = a.avg_temp_c - b.avg_temp_c;
          break;
        case 'rainfall':
          comparison = a.avg_precip_mm_per_day - b.avg_precip_mm_per_day;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [filteredResults, sortField, sortDirection]);

  // Check if any filters are active
  const hasActiveFilters = filters.regions.length > 0 ||
    filters.countries.length > 0 ||
    filters.maxPrice !== null ||
    filters.minTemp !== null ||
    filters.directOnly;

  // Handle sort change
  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Set sensible defaults for direction
      setSortDirection(field === 'price' || field === 'rainfall' ? 'asc' : 'desc');
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  // Toggle region filter
  const toggleRegion = (region: Region) => {
    setFilters(prev => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter(r => r !== region)
        : [...prev.regions, region],
    }));
  };

  // Toggle country filter
  const toggleCountry = (country: string) => {
    setFilters(prev => ({
      ...prev,
      countries: prev.countries.includes(country)
        ? prev.countries.filter(c => c !== country)
        : [...prev.countries, country],
    }));
  };

  if (results.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <p className="text-gray-600 dark:text-gray-400 text-center">
          {t('noDestinations')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
      {/* Header with title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
            {t('topDestinations', { count: results.length })}
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {t('dailyAverages')}
          </p>
        </div>
        {hasActiveFilters && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('showingResults', { count: sortedResults.length, total: results.length })}
          </span>
        )}
      </div>

      {/* Sort and Filter Controls */}
      <div className="mb-6 space-y-4">
        {/* Sort Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {t('sortBy')}:
          </span>
          <div className="flex flex-wrap gap-2">
            {(['score', 'price', 'temperature', 'rainfall'] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => handleSortChange(field)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  sortField === field
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {field === 'score' && t('score')}
                {field === 'price' && t('price')}
                {field === 'temperature' && t('temperature')}
                {field === 'rainfall' && t('rainfall')}
                {sortField === field && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {sortDirection === 'desc' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    )}
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`ml-auto px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              showFilters || hasActiveFilters
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {t('filters')}
            {hasActiveFilters && (
              <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {filters.regions.length + filters.countries.length + (filters.maxPrice !== null ? 1 : 0) + (filters.minTemp !== null ? 1 : 0) + (filters.directOnly ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Region Filter */}
              {availableRegions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('region')}
                  </label>
                  <div className="space-y-1.5">
                    {availableRegions.map(region => (
                      <label key={region} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.regions.includes(region)}
                          onChange={() => toggleRegion(region)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t(region)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Country Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('country')}
                </label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {availableCountries.map(country => (
                    <label key={country} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.countries.includes(country)}
                        onChange={() => toggleCountry(country)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{country}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Price & Temperature Filters */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('maxPrice')} (EUR)
                  </label>
                  <input
                    type="number"
                    value={filters.maxPrice ?? ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      maxPrice: e.target.value ? Number(e.target.value) : null,
                    }))}
                    placeholder="e.g. 150"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('minTemperature')} (°C)
                  </label>
                  <input
                    type="number"
                    value={filters.minTemp ?? ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      minTemp: e.target.value ? Number(e.target.value) : null,
                    }))}
                    placeholder="e.g. 20"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Direct Flights Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('stopsLabel')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.directOnly}
                    onChange={(e) => setFilters(prev => ({ ...prev, directOnly: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t('directFlightsOnly')}</span>
                </label>
              </div>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={clearFilters}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
                >
                  {t('clearFilters')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active Filter Chips */}
        {hasActiveFilters && !showFilters && (
          <div className="flex flex-wrap gap-2">
            {filters.regions.map(region => (
              <span
                key={region}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full"
              >
                {t(region)}
                <button onClick={() => toggleRegion(region)} className="hover:text-indigo-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {filters.countries.map(country => (
              <span
                key={country}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full"
              >
                {country}
                <button onClick={() => toggleCountry(country)} className="hover:text-indigo-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {filters.maxPrice !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">
                ≤ €{filters.maxPrice}
                <button onClick={() => setFilters(prev => ({ ...prev, maxPrice: null }))} className="hover:text-indigo-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            {filters.minTemp !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">
                ≥ {filters.minTemp}°C
                <button onClick={() => setFilters(prev => ({ ...prev, minTemp: null }))} className="hover:text-indigo-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            {filters.directOnly && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">
                {t('direct')}
                <button onClick={() => setFilters(prev => ({ ...prev, directOnly: false }))} className="hover:text-indigo-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              {t('clearFilters')}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {sortedResults.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">{t('noResults')}</p>
          <button
            onClick={clearFilters}
            className="mt-4 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
          >
            {t('clearFilters')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedResults.map((result, index) => (
            <DestinationCard
              key={`${result.city}-${result.airport}-${index}`}
              result={result}
              rank={index + 1}
              highlightField={sortField}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DestinationCard({ result, rank, highlightField }: { result: SearchResult; rank: number; highlightField: SortField }) {
  const { t } = useLanguage();
  const countryCode = getCountryCode(result.country);
  const flagUrl = getFlagUrl(countryCode, 'w2560');
  const isTopResult = rank === 1;
  const scoreButtonRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  // Helper to determine if a field is highlighted
  const isHighlighted = (field: SortField) => highlightField === field;

  const handleScoreHover = (isHovering: boolean) => {
    if (isHovering && scoreButtonRef.current) {
      const rect = scoreButtonRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 10, // Position above the button
        left: rect.left + rect.width / 2, // Center horizontally
      });
    }
    setShowTooltip(isHovering);
  };

  return (
    <div className="relative">
      <div className={`relative border rounded-xl transition-all hover:shadow-lg overflow-hidden ${
        isTopResult
          ? 'border-indigo-300 dark:border-indigo-600 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-gray-800'
          : 'border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900'
      }`}>
      {/* Flag background */}
      <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-24 sm:w-40 opacity-25 dark:opacity-15 pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url(${flagUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            maskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative z-10 p-4 sm:p-5">
        {/* Mobile Layout */}
        <div className="sm:hidden">
          {/* Top row: Rank, City, Price */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold ${isTopResult ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
                #{rank}
              </span>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">
                  {result.city}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {result.country} · {result.airport}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${isHighlighted('price') ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                €{result.flight_price.toFixed(0)}
              </div>
            </div>
          </div>

          {/* Stats Grid - 2x2 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`px-2.5 py-1.5 rounded-lg ${isHighlighted('score') ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('score')}</span>
              <span className={`text-sm font-semibold ${isHighlighted('score') ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                {result.score.toFixed(1)}
              </span>
            </div>
            <div className={`px-2.5 py-1.5 rounded-lg ${isHighlighted('temperature') ? 'bg-orange-100 dark:bg-orange-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('temperature')}</span>
              <span className={`text-sm font-semibold ${isHighlighted('temperature') ? 'text-orange-700 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                {result.avg_temp_c.toFixed(1)}°C
              </span>
            </div>
            <div className={`px-2.5 py-1.5 rounded-lg ${isHighlighted('rainfall') ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('rainfall')}</span>
              <span className={`text-sm font-semibold ${isHighlighted('rainfall') ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                {result.avg_precip_mm_per_day.toFixed(1)} mm
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700/50">
              <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('stopsLabel')}</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {result.total_stops === 0 ? t('direct') : `${result.total_stops}`}
              </span>
            </div>
          </div>

          {/* Bottom row: Dates and Airline */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <span>{new Date(result.best_departure).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <span className="mx-1">→</span>
              <span>{new Date(result.best_return).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <AirlineDisplay airlines={result.airlines} />
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:block">
          <div className="flex items-center gap-4">
            {/* Rank */}
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
              isTopResult
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}>
              {rank}
            </div>

            {/* City Info - expanded with region */}
            <div className="flex-1 min-w-0 pr-4">
              <h3 className={`font-semibold text-gray-900 dark:text-white ${isTopResult ? 'text-xl' : 'text-lg'}`}>
                {result.city}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {result.country} · {result.airport}
              </p>
              {/* Flight dates inline on desktop */}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Date(result.best_departure).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                <span className="mx-1">→</span>
                {new Date(result.best_return).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Score with tooltip */}
              <div 
                ref={scoreButtonRef}
                onMouseEnter={() => handleScoreHover(true)}
                onMouseLeave={() => handleScoreHover(false)}
                className={`relative px-3 py-2 rounded-lg text-center min-w-[70px] ${
                  isHighlighted('score')
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-2 ring-indigo-500'
                    : 'bg-gray-100 dark:bg-gray-700/50'
                }`}
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                  {t('score')}
                  <svg className="w-3 h-3 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <span className={`text-base font-bold ${isHighlighted('score') ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                  {result.score.toFixed(1)}
                </span>
              </div>

              {/* Temperature */}
              <div className={`px-3 py-2 rounded-lg text-center min-w-[70px] ${
                isHighlighted('temperature')
                  ? 'bg-orange-100 dark:bg-orange-900/40 ring-2 ring-orange-500'
                  : 'bg-gray-100 dark:bg-gray-700/50'
              }`}>
                <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('temperature')}</span>
                <span className={`text-base font-bold ${isHighlighted('temperature') ? 'text-orange-700 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                  {result.avg_temp_c.toFixed(1)}°C
                </span>
              </div>

              {/* Rainfall */}
              <div className={`px-3 py-2 rounded-lg text-center min-w-[70px] ${
                isHighlighted('rainfall')
                  ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500'
                  : 'bg-gray-100 dark:bg-gray-700/50'
              }`}>
                <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('rainfall')}</span>
                <span className={`text-base font-bold ${isHighlighted('rainfall') ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                  {result.avg_precip_mm_per_day.toFixed(1)}mm
                </span>
              </div>

              {/* Stops */}
              <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-center min-w-[70px]">
                <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('stopsLabel')}</span>
                <span className="text-base font-bold text-gray-900 dark:text-white">
                  {result.total_stops === 0 ? t('direct') : result.total_stops}
                </span>
              </div>
            </div>

            {/* Price */}
            <div className={`flex-shrink-0 px-4 py-2 rounded-lg text-center min-w-[90px] ${
              isHighlighted('price')
                ? 'bg-green-100 dark:bg-green-900/40 ring-2 ring-green-500'
                : 'bg-green-50 dark:bg-green-900/20'
            }`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">{t('price')}</span>
              <span className={`text-xl font-bold ${isHighlighted('price') ? 'text-green-700 dark:text-green-300' : 'text-green-600 dark:text-green-400'}`}>
                €{result.flight_price.toFixed(0)}
              </span>
            </div>

            {/* Airline - right aligned */}
            <div className="flex-shrink-0 min-w-[100px] flex flex-col items-end justify-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t('airline')}</div>
              <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center justify-end">
                <AirlineDisplay airlines={result.airlines} />
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      {/* Tooltip - positioned outside overflow container, appears above */}
      {showTooltip && (
        <div 
          className="fixed px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg whitespace-nowrap z-[100] shadow-lg pointer-events-none transition-opacity"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            marginTop: '-0.5rem',
          }}
        >
          {t('scoreExplanation')}
          {/* Arrow pointing down */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
        </div>
      )}
    </div>
  );
}
