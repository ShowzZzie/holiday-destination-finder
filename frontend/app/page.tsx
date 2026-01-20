'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { startSearch, getJobStatus, checkHealth, cancelJob, SearchParams, JobStatus, SearchResult } from '@/lib/api';
import { getCountryCode, getFlagUrl } from '@/lib/country-flags';
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
  const [jobHistory, setJobHistory] = useState<Array<{ jobId: string; origin: string; start: string; end: string }>>([]);
  const [validJobIds, setValidJobIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recentlyCreatedJobIds, setRecentlyCreatedJobIds] = useState<Set<string>>(new Set());
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
                ? { ...item, origin: meta.origin || item.origin, start: meta.start || item.start, end: meta.end || item.end }
                : item
            );
          }
          // New job - add to front
          const newEntry = {
            jobId: jobStatus.job_id,
            origin: meta.origin || 'N/A',
            start: meta.start || 'N/A',
            end: meta.end || 'N/A',
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
  }, [jobStatus?.job_id, jobStatus?.payload?.meta, formData.origin, formData.start, formData.end, recentlyCreatedJobIds]);

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

  const handleJobReorder = (newOrder: Array<{ jobId: string; origin: string; start: string; end: string }>) => {
    setJobHistory(newOrder);
    localStorage.setItem('jobHistory', JSON.stringify(newOrder));
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
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      
      {/* Main Content */}
      <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            ✈️ {t('title')}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            {t('subtitle')}
          </p>
          {isApiHealthy === false && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg inline-block">
              {t('apiUnreachable')}
            </div>
          )}
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
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
  open, 
  onToggle 
}: { 
  jobHistory: Array<{ jobId: string; origin: string; start: string; end: string }>; 
  validJobIds: Set<string>;
  selectedJobId: string | null; 
  onJobSelect: (jobId: string) => void;
  onReorder: (newOrder: Array<{ jobId: string; origin: string; start: string; end: string }>) => void;
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Job History</h3>
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
        <div className="flex flex-col h-[calc(100vh-4rem)]">
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

function ResultsDisplay({ results }: { results: SearchResult[] }) {
  const { t } = useLanguage();
  
  if (results.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <p className="text-gray-600 dark:text-gray-400 text-center">
          {t('noDestinations')}
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
        {t('topDestinations', { count: results.length })}
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
  const { t } = useLanguage();
  const countryCode = getCountryCode(result.country);
  const flagUrl = getFlagUrl(countryCode, 'w2560');
  const isItaly = result.country === 'Italy';

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
              backgroundImage: `url(${flagUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: isItaly ? '30% center' : 'center center',
              backgroundRepeat: 'no-repeat',
              clipPath: 'polygon(0 0, 85% 0, 100% 100%, 0 100%)',
              WebkitClipPath: 'polygon(0 0, 85% 0, 100% 100%, 0 100%)',
              filter: 'blur(0px)',
              width: isItaly ? '140%' : '120%',
              height: '100%',
              top: '0%',
              left: isItaly ? '0%' : '14%',
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
              {t('score')}: {result.score.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">🌡️ {t('temperature')}</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {result.avg_temp_c.toFixed(1)}°C
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">🌧️ {t('rainfall')}</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {result.avg_precip_mm_per_day.toFixed(2)} mm/day
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">✈️ {t('stopsLabel')}</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {result.total_stops === 0 ? t('direct') : `${result.total_stops} ${result.total_stops === 1 ? t('stop') : t('stops')}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">🛫 {t('airline')}</span>
            <div className="font-medium text-gray-900 dark:text-white text-right max-w-[60%] truncate">
              <AirlineDisplay airlines={result.airlines} />
            </div>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              <div>✈️ {t('departure')}: {new Date(result.best_departure).toLocaleDateString()}</div>
              <div>🔄 {t('return')}: {new Date(result.best_return).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WideDestinationCard({ result, rank }: { result: SearchResult; rank: number }) {
  const { t } = useLanguage();
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
              backgroundImage: `url(${flagUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'left center',
              backgroundRepeat: 'no-repeat',
              clipPath: 'polygon(0 0, 80% 0, 95% 100%, 0 100%)',
              WebkitClipPath: 'polygon(0 0, 80% 0, 95% 100%, 0 100%)',
              filter: 'blur(0px)',
              width: '180%',
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
              {t('score')}: {result.score.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">🌡️ {t('temperature')}</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base">
              {result.avg_temp_c.toFixed(1)}°C
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">🌧️ {t('rainfall')}</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base">
              {result.avg_precip_mm_per_day.toFixed(2)} mm/day
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">✈️ {t('stops')}</span>
            <span className="font-semibold text-gray-900 dark:text-white text-base">
              {result.total_stops === 0 ? t('direct') : `${result.total_stops} ${result.total_stops === 1 ? t('stop') : t('stops')}`}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400 block mb-1">🛫 {t('airline')}</span>
            <div className="font-semibold text-gray-900 dark:text-white text-base truncate block">
              <AirlineDisplay airlines={result.airlines} />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-6 text-base font-semibold text-gray-900 dark:text-white">
            <div>
              ✈️ {t('departure')}: <span className="text-indigo-600 dark:text-indigo-400">{new Date(result.best_departure).toLocaleDateString()}</span>
            </div>
            <div>
              🔄 {t('return')}: <span className="text-indigo-600 dark:text-indigo-400">{new Date(result.best_return).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListDestinationCard({ result, rank }: { result: SearchResult; rank: number }) {
  const { t } = useLanguage();
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
              backgroundImage: `url(${flagUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'left center',
              backgroundRepeat: 'no-repeat',
              filter: 'blur(0px)',
              width: '150%',
              height: '100%',
              top: '0%',
              left: '0%',
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
              {t('score')}: {result.score.toFixed(1)}
            </div>
          </div>
          
          <div className="text-right min-w-[140px]">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              <div>✈️ {new Date(result.best_departure).toLocaleDateString()}</div>
              <div>🔄 {new Date(result.best_return).toLocaleDateString()}</div>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span>{result.total_stops === 0 ? t('direct') : `${result.total_stops} ${result.total_stops === 1 ? t('stop') : t('stops')}`}</span>
                <span>•</span>
                <AirlineDisplay airlines={result.airlines} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
