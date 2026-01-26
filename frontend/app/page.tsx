'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { startSearch, getJobStatus, checkHealth, cancelJob, SearchParams, JobStatus, SearchResult } from '@/lib/api';
import { COUNTRIES, Country, Airport as AirportData } from '@/lib/airports';

// City grouping for autocomplete
interface CityGroup {
  name: string;
  kgmid: string;
  countryName: string;
  airports: AirportData[];
}

// Helper to convert origin (IATA or kgmid) to readable display name
function getOriginDisplayName(origin: string): string {
  if (!origin) return 'Unknown';

  // Check if it's a country kgmid
  const countryMatch = COUNTRIES.find(c => c.kgmid === origin);
  if (countryMatch) return countryMatch.name;

  // Check if it's a city kgmid
  for (const country of COUNTRIES) {
    const airport = country.airports.find(a => a.city_kgmid === origin);
    if (airport) return `${airport.city} (${country.name})`;
  }

  // Check if it's an airport IATA
  for (const country of COUNTRIES) {
    const airport = country.airports.find(a => a.iata === origin);
    if (airport) return `${airport.city} (${airport.iata})`;
  }

  // Fallback - return as-is
  return origin;
}

// Build Google Flights URL for a specific flight search
function buildGoogleFlightsUrl(
  originIata: string,
  destIata: string,
  departDate: string,
  returnDate: string
): string {
  // Format dates as YYYY-MM-DD (they should already be in this format)
  const depDate = departDate.split('T')[0];
  const retDate = returnDate.split('T')[0];

  // Build the URL using Google Flights search format
  // Using the natural language query which Google parses well
  const query = `flights from ${originIata} to ${destIata} on ${depDate} returning ${retDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}
import { getCountryCode, getFlagUrl, getRegion, ALL_REGIONS, Region } from '@/lib/country-flags';
import { useLanguage } from '@/app/contexts/LanguageContext';
import { useCurrency } from '@/app/contexts/CurrencyContext';
import DateRangePicker from '@/app/components/DateRangePicker';

// Mapping of common airline names/codes to IATA codes for logo fetching
const AIRLINE_MAPPING: Record<string, string> = {
  'ryanair': 'FR',
  'wizz air': 'W6',
  'wizzair': 'W6',
  'lufthansa': 'LH',
  'easyjet': 'U2',
  'vueling': 'VY',
  'norwegian': 'DY',
  'british airways': 'BA',
  'klm': 'KL',
  'air france': 'AF',
  'lot polish airlines': 'LO',
  'lot': 'LO',
  'swiss': 'LX',
  'austrian': 'OS',
  'air dolomiti': 'EN',
  'sas': 'SK',
  'tap air portugal': 'TP',
  'tap': 'TP',
  'iberia': 'IB',
  'finnair': 'AY',
  'aegean': 'A3',
  'turkish airlines': 'TK',
  'pegasus': 'PC',
  'eurowings': 'EW',
  'volotea': 'V7',
  'transavia': 'HV',
  'jet2': 'LS',
  'condor': 'DE',
  'air baltic': 'BT',
  'airbaltic': 'BT',
  'brussels airlines': 'SN',
  'luxair': 'LG',
};

// Helper function to get airline logo URL
function getAirlineLogoUrl(airlineName: string): string | null {
  const normalized = airlineName.toLowerCase();
  
  // 1. Prioritize specific brand logos (Ryanair, Wizz) as requested
  if (normalized.includes('ryanair')) return 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/ryanair.svg';
  if (normalized.includes('wizz')) return 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/wizzair.svg';

  // 2. Check our explicit mapping for others
  for (const [name, code] of Object.entries(AIRLINE_MAPPING)) {
    if (normalized.includes(name)) {
      return `https://pics.avs.io/200/200/${code}.png`;
    }
  }

  // 3. If the airline name looks like an IATA code (2 characters)
  if (airlineName.length === 2 && /^[A-Z0-9]{2}$/.test(airlineName)) {
    return `https://pics.avs.io/200/200/${airlineName}.png`;
  }

  // 4. Try to extract a 2-letter code if the string starts with one (e.g. "LX 1234")
  const codeMatch = airlineName.match(/^([A-Z0-9]{2})/);
  if (codeMatch) {
    return `https://pics.avs.io/200/200/${codeMatch[1]}.png`;
  }

  return null;
}

// Component to render airline name with optional logo
function AirlineDisplay({ airlines }: { airlines: string }) {
  if (!airlines) return null;

  const truncateName = (name: string, maxLen: number = 24) => {
    if (name.length <= maxLen) return name;
    
    // Find the last space within the limit to avoid cutting words
    const truncated = name.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLen * 0.6) { // Only cut at space if it's reasonably far in
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  };

  // Split airlines by common separators
  const airlineList = airlines.split(/ and | \/ | \| |, /).map(a => a.trim()).filter(Boolean);
  
  if (airlineList.length === 0) return <span>{truncateName(airlines)}</span>;

  const firstAirline = airlineList[0];
  const truncatedFirst = truncateName(firstAirline);
  const remainingCount = airlineList.length - 1;
  const logoUrl = getAirlineLogoUrl(firstAirline);
  const isSimpleIcon = logoUrl?.includes('cdn.jsdelivr.net');
  
  return (
    <span className="flex items-center gap-2" title={airlines}>
      {logoUrl && (
        <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center">
          <Image 
            src={logoUrl}
            alt={firstAirline}
            width={28}
            height={28}
            className={`inline-block object-contain transition-all ${
              isSimpleIcon ? 'dark:invert dark:brightness-200' : 'dark:brightness-110 dark:contrast-125'
            }`}
          />
        </div>
      )}
      <span className="whitespace-nowrap flex items-center">
        {truncatedFirst}
        {remainingCount > 0 && (
          <span className="ml-1.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full font-medium border border-gray-200 dark:border-gray-700 leading-none">
            +{remainingCount}
          </span>
        )}
      </span>
    </span>
  );
}

// SerpAPI only works for current month + 5 months ahead.
// January → can search up to end of June, February → end of July, etc.
// Check END date - if any part of the window extends beyond, use fallback.
function isExtendedDateRange(endDate: string): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  const today = new Date();

  // Calculate the last day of (current month + 5)
  // new Date(year, month + 1, 0) gives last day of that month
  const cutoffDate = new Date(today.getFullYear(), today.getMonth() + 6, 0);

  return end > cutoffDate;
}

export default function Home() {
  const { t } = useLanguage();

  // Debug mode: show provider selection UI when ?debug=true is in URL
  const [isDebugMode, setIsDebugMode] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsDebugMode(params.get('debug') === 'true');
  }, []);

  const [formData, setFormData] = useState<SearchParams>({
    origin: '',
    start: '',
    end: '',
    trip_length: 7,
    providers: ['serpapi'],
    top_n: 10,
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

  // Origin autocomplete state
  const [originInput, setOriginInput] = useState<string>('');
  const [originSuggestions, setOriginSuggestions] = useState<{
    countries: Country[];
    cities: CityGroup[];
    airports: AirportData[];
  }>({ countries: [], cities: [], airports: [] });
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const originRef = useRef<HTMLDivElement>(null);
  const suggestionListRef = useRef<HTMLUListElement>(null);

  const selectSuggestion = (suggestion: { type: string; data: any }) => {
    if (suggestion.type === 'country') {
      const country = suggestion.data as Country;
      setOriginInput(country.name);
      setFormData(prev => ({ ...prev, origin: country.kgmid }));
    } else if (suggestion.type === 'city') {
      const city = suggestion.data as CityGroup;
      setOriginInput(`${city.name} (all airports)`);
      setFormData(prev => ({ ...prev, origin: city.kgmid }));
    } else if (suggestion.type === 'airport') {
      const airport = suggestion.data as AirportData;
      setOriginInput(`${airport.city} (${airport.iata})`);
      setFormData(prev => ({ ...prev, origin: airport.iata }));
    }
    setShowOriginSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  // Flatten suggestions for keyboard navigation
  const flatSuggestions = useMemo(() => {
    const flat: Array<{
      type: 'country' | 'city' | 'airport';
      data: Country | CityGroup | AirportData;
      parentId?: string;
    }> = [];

    originSuggestions.countries.forEach(country => {
      flat.push({ type: 'country', data: country });
      if (expandedCountries.has(country.name)) {
        country.airports.forEach(airport => {
          flat.push({ type: 'airport', data: airport, parentId: country.name });
        });
      }
    });

    originSuggestions.cities.forEach(city => {
      flat.push({ type: 'city', data: city });
      if (expandedCities.has(city.kgmid)) {
        city.airports.forEach(airport => {
          flat.push({ type: 'airport', data: airport, parentId: city.kgmid });
        });
      }
    });

    originSuggestions.airports.forEach(airport => {
      flat.push({ type: 'airport', data: airport });
    });

    return flat;
  }, [originSuggestions, expandedCountries, expandedCities]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(-1);
  }, [flatSuggestions]);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedSuggestionIndex >= 0 && suggestionListRef.current) {
      const selectedElement = suggestionListRef.current.children[selectedSuggestionIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
        });
      }
    }
  }, [selectedSuggestionIndex]);

  // Filter based on input
  useEffect(() => {
    const q = originInput.trim().toLowerCase();

    // Check if input looks like a previously selected label "City (IATA)", "Country", or "City (all airports)"
    // and if we should suppress suggestions
    const isExactSelection = COUNTRIES.some(c =>
      c.name === originInput ||
      c.airports.some(a =>
        `${a.city} (${a.iata})` === originInput ||
        (a.city_kgmid && `${a.city} (all airports)` === originInput)
      )
    );

    if (!isExactSelection && originInput.trim() !== '') {
      // If user is typing and hasn't made an explicit selection yet,
      // clear the origin ID to ensure they must pick a suggestion.
      setFormData(prev => ({ ...prev, origin: '' }));
    }

    if (q.length < 2 || isExactSelection) {
      setOriginSuggestions({ countries: [], cities: [], airports: [] });
      return;
    }

    // All providers now support country/city kgmid origins
    // Backend handles expansion to individual airports for Ryanair/WizzAir

    const matchedCountries: Country[] = [];
    const matchedCities: CityGroup[] = [];
    const matchedAirports: AirportData[] = [];

    // Track cities we've already added to avoid duplicates
    const addedCityKgmids = new Set<string>();

    COUNTRIES.forEach(country => {
      const countryMatches = country.name.toLowerCase().includes(q);

      if (countryMatches) {
        // Show country as an option - backend will iterate through airports if needed
        matchedCountries.push(country);
      } else {
        // Check for city name matches - group by city
        const cityMatches = new Map<string, AirportData[]>();
        const directAirportMatches: AirportData[] = [];

        country.airports.forEach(airport => {
          const cityNameMatches = airport.city.toLowerCase().includes(q);
          const iataMatches = airport.iata.toLowerCase().includes(q);
          const airportNameMatches = airport.name.toLowerCase().includes(q);

          if (cityNameMatches && airport.city_kgmid) {
            // City name matched - group by city_kgmid
            const key = airport.city_kgmid;
            if (!cityMatches.has(key)) {
              cityMatches.set(key, []);
            }
            cityMatches.get(key)!.push(airport);
          } else if (iataMatches || airportNameMatches) {
            // IATA or airport name matched - show as direct airport
            directAirportMatches.push(airport);
          }
        });

        // Process city matches
        cityMatches.forEach((airports, kgmid) => {
          if (!addedCityKgmids.has(kgmid)) {
            addedCityKgmids.add(kgmid);
            // Show city group if city has more than one airport
            // Backend will iterate through airports for all providers
            if (airports.length > 1) {
              matchedCities.push({
                name: airports[0].city,
                kgmid: kgmid,
                countryName: country.name,
                airports: airports,
              });
            } else {
              // Single airport city - show airport directly
              matchedAirports.push(...airports);
            }
          }
        });

        // Add direct airport matches
        matchedAirports.push(...directAirportMatches);
      }
    });

    setOriginSuggestions({
      countries: matchedCountries.slice(0, 5),
      cities: matchedCities.slice(0, 5),
      airports: matchedAirports.slice(0, 10)
    });
  }, [originInput, formData.providers]);

  // Handle clicking outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (originRef.current && !originRef.current.contains(event.target as Node)) {
        setShowOriginSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync originInput with formData.origin when selected from history
  useEffect(() => {
    if (formData.origin) {
      // Find if it's a country kgmid
      const countryMatch = COUNTRIES.find(c => c.kgmid === formData.origin);
      if (countryMatch) {
        if (originInput !== countryMatch.name) {
          setOriginInput(countryMatch.name);
        }
        return;
      }

      // Find if it's a city kgmid
      let cityMatch: { city: string; kgmid: string } | undefined;
      COUNTRIES.some(c => {
        const airport = c.airports.find(a => a.city_kgmid === formData.origin);
        if (airport && airport.city_kgmid) {
          cityMatch = { city: airport.city, kgmid: airport.city_kgmid };
          return true;
        }
        return false;
      });

      if (cityMatch) {
        const expectedInput = `${cityMatch.city} (all airports)`;
        if (originInput !== expectedInput) {
          setOriginInput(expectedInput);
        }
        return;
      }

      // Find if it's an airport IATA
      let airportMatch: AirportData | undefined;
      COUNTRIES.some(c => {
        airportMatch = c.airports.find(a => a.iata === formData.origin);
        return !!airportMatch;
      });

      if (airportMatch) {
        const expectedInput = `${airportMatch.city} (${airportMatch.iata})`;
        if (originInput !== expectedInput) {
          setOriginInput(expectedInput);
        }
      } else if (originInput !== formData.origin) {
        setOriginInput(formData.origin);
      }
    }
  }, [formData.origin]);

  const toggleCountryExpansion = (e: React.MouseEvent, countryName: string) => {
    e.stopPropagation();
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryName)) {
        next.delete(countryName);
      } else {
        next.add(countryName);
      }
      return next;
    });
  };

  const toggleCityExpansion = (e: React.MouseEvent, cityKgmid: string) => {
    e.stopPropagation();
    setExpandedCities(prev => {
      const next = new Set(prev);
      if (next.has(cityKgmid)) {
        next.delete(cityKgmid);
      } else {
        next.add(cityKgmid);
      }
      return next;
    });
  };

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
      if (!formData.origin) {
        throw new Error("Please select an origin from the suggestions (start typing a city, country, or airport name).");
      }

      // Debug: log what we're sending
      // Backend handles kgmid expansion for country/city searches
      console.log('🚀 Submitting search:', { origin: formData.origin, providers: formData.providers });

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
    setFormData(prev => {
      const newProviders = checked
        ? [...prev.providers, provider]
        : prev.providers.filter(p => p !== provider);

      // If adding non-serpapi provider and current origin is a kgmid, clear it
      const isOnlySerpApi = newProviders.length === 1 && newProviders[0] === 'serpapi';
      const originIsKgmid = prev.origin.startsWith('/');

      if (!isOnlySerpApi && originIsKgmid) {
        // Clear kgmid origin - user needs to select an airport
        setOriginInput('');
        return { ...prev, providers: newProviders, origin: '' };
      }

      return { ...prev, providers: newProviders };
    });
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

  // Auto-select providers based on date range when not in debug mode
  // SerpAPI only works for ~5 months ahead, use Ryanair/Wizzair for extended dates
  // Backend now supports kgmid (country/city) origins with ryanair/wizzair by expanding to airports
  useEffect(() => {
    if (isDebugMode) return; // Don't auto-change in debug mode

    const isExtended = isExtendedDateRange(formData.end);
    const newProviders = isExtended ? ['ryanair', 'wizzair'] : ['serpapi'];

    // Only update if providers actually changed
    // Don't clear origin - backend handles kgmid expansion automatically
    if (JSON.stringify(formData.providers) !== JSON.stringify(newProviders)) {
      setFormData(prev => ({ ...prev, providers: newProviders }));
    }
  }, [formData.end, isDebugMode]);

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
                <div className="relative" ref={originRef}>
                  <input
                    type="text"
                    id="origin"
                    value={originInput}
                    onChange={(e) => {
                      setOriginInput(e.target.value);
                      setShowOriginSuggestions(true);
                    }}
                    onFocus={() => setShowOriginSuggestions(true)}
                    onKeyDown={(e) => {
                      if (!showOriginSuggestions || flatSuggestions.length === 0) return;

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedSuggestionIndex(prev => 
                          prev < flatSuggestions.length - 1 ? prev + 1 : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedSuggestionIndex(prev => 
                          prev > 0 ? prev - 1 : flatSuggestions.length - 1
                        );
                      } else if (e.key === 'Enter') {
                        if (selectedSuggestionIndex >= 0) {
                          e.preventDefault();
                          selectSuggestion(flatSuggestions[selectedSuggestionIndex]);
                        }
                      } else if (e.key === 'Escape') {
                        setShowOriginSuggestions(false);
                      }
                    }}
                    className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 autofill:bg-white autofill:text-gray-900"
                    placeholder="City, Country, or IATA"
                    required
                    disabled={isSearching}
                    autoComplete="off"
                  />
                  {showOriginSuggestions && (originSuggestions.countries.length > 0 || originSuggestions.cities.length > 0 || originSuggestions.airports.length > 0) && (
                    <ul 
                      ref={suggestionListRef}
                      className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-auto py-1"
                    >
                      {/* Country suggestions */}
                      {originSuggestions.countries.map((country) => {
                        const countryIndex = flatSuggestions.findIndex(f => f.type === 'country' && (f.data as Country).kgmid === country.kgmid);
                        const isSelected = selectedSuggestionIndex === countryIndex;
                        
                        return (
                          <li key={country.kgmid}>
                            <div
                              className={`px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex justify-between items-center group ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                              onClick={() => selectSuggestion({ type: 'country', data: country })}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border border-gray-200 dark:border-gray-600 px-1 rounded">Country</span>
                                <span className="font-medium text-gray-900 dark:text-white">{country.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => toggleCountryExpansion(e, country.name)}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-500 rounded text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer"
                              >
                                {expandedCountries.has(country.name) ? 'Collapse' : `Show ${country.airports.length} airports`}
                              </button>
                            </div>
                            {expandedCountries.has(country.name) && (
                              <ul className="bg-gray-50 dark:bg-gray-800/50 border-t border-b border-gray-100 dark:border-gray-700/50">
                                {country.airports.map(airport => {
                                  const airportIndex = flatSuggestions.findIndex(f => f.type === 'airport' && (f.data as AirportData).iata === airport.iata && f.parentId === country.name);
                                  const isAirportSelected = selectedSuggestionIndex === airportIndex;
                                  
                                  return (
                                    <li
                                      key={airport.iata}
                                      className={`pl-8 pr-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex justify-between items-center ${isAirportSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                                      onClick={() => selectSuggestion({ type: 'airport', data: airport })}
                                    >
                                      <div>
                                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{airport.city}</div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{airport.name}</div>
                                      </div>
                                      <div className="text-xs font-bold text-indigo-500">{airport.iata}</div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      {/* City suggestions */}
                      {originSuggestions.cities.map((city) => {
                        const cityIndex = flatSuggestions.findIndex(f => f.type === 'city' && (f.data as CityGroup).kgmid === city.kgmid);
                        const isSelected = selectedSuggestionIndex === cityIndex;
                        
                        return (
                          <li key={city.kgmid}>
                            <div
                              className={`px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex justify-between items-center group ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                              onClick={() => selectSuggestion({ type: 'city', data: city })}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider border border-blue-300 dark:border-blue-600 px-1 rounded">City</span>
                                <div>
                                  <span className="font-medium text-gray-900 dark:text-white">{city.name}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({city.countryName})</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => toggleCityExpansion(e, city.kgmid)}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-500 rounded text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer"
                              >
                                {expandedCities.has(city.kgmid) ? 'Collapse' : `Show ${city.airports.length} airports`}
                              </button>
                            </div>
                            {expandedCities.has(city.kgmid) && (
                              <ul className="bg-gray-50 dark:bg-gray-800/50 border-t border-b border-gray-100 dark:border-gray-700/50">
                                {city.airports.map(airport => {
                                  const airportIndex = flatSuggestions.findIndex(f => f.type === 'airport' && (f.data as AirportData).iata === airport.iata && f.parentId === city.kgmid);
                                  const isAirportSelected = selectedSuggestionIndex === airportIndex;
                                  
                                  return (
                                    <li
                                      key={airport.iata}
                                      className={`pl-8 pr-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex justify-between items-center ${isAirportSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                                      onClick={() => selectSuggestion({ type: 'airport', data: airport })}
                                    >
                                      <div>
                                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{airport.city}</div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{airport.name}</div>
                                      </div>
                                      <div className="text-xs font-bold text-indigo-500">{airport.iata}</div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      {/* Direct airport suggestions */}
                      {originSuggestions.airports.map((airport) => {
                        const airportIndex = flatSuggestions.findIndex(f => f.type === 'airport' && (f.data as AirportData).iata === airport.iata && !f.parentId);
                        const isSelected = selectedSuggestionIndex === airportIndex;
                        
                        return (
                          <li
                            key={airport.iata}
                            className={`px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex justify-between items-center ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                            onClick={() => selectSuggestion({ type: 'airport', data: airport })}
                          >
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">{airport.city}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{airport.name}</div>
                            </div>
                            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 ml-2">{airport.iata}</div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('travelDates')}
                  {/* Inline warning for extended date range */}
                  {isExtendedDateRange(formData.end) && (
                    <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                      ⚠ Extended search (Ryanair/Wizzair only)
                    </span>
                  )}
                </label>
                <DateRangePicker
                  startDate={formData.start}
                  endDate={formData.end}
                  onStartChange={(date) => setFormData(prev => ({ ...prev, start: date }))}
                  onEndChange={(date) => setFormData(prev => ({ ...prev, end: date }))}
                  startLabel={t('startDate')}
                  endLabel={t('endDate')}
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
                  className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
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
                  className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                  min="1"
                  max="50"
                  required
                  disabled={isSearching}
                />
              </div>
            </div>

            {/* Provider selection - only visible in debug mode (?debug=true) */}
            {isDebugMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('flightProviders')} <span className="text-xs text-amber-600">(Debug Mode)</span>
                </label>
                <div className="flex flex-wrap gap-4">
                  {['serpapi', 'ryanair', 'wizzair', 'amadeus'].map(provider => (
                    <label key={provider} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.providers.includes(provider)}
                        onChange={(e) => handleProviderChange(provider, e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                        disabled={isSearching}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                        {provider}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSearching || formData.providers.length === 0}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer text-white font-semibold rounded-lg transition-colors"
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
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
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
        {/* Multi-airport origin progress */}
        {jobStatus.origin_airport && jobStatus.origin_airport_idx && jobStatus.origin_airport_total && (
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-2">
            <span className="font-medium">{t('searchingFrom')} </span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{jobStatus.origin_airport}</span>
            <span className="ml-1">({jobStatus.origin_airport_idx}/{jobStatus.origin_airport_total} {t('airports')})</span>
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
        className={`fixed top-24 z-40 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 cursor-pointer ${
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
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
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
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
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
                          {getOriginDisplayName(job.origin)} · {formatDate(job.start)} · {formatDate(job.end)}
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
  const { formatPrice } = useCurrency();
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Stats column widths state for dynamic alignment
  const [colWidths, setColWidths] = useState({
    score: 0,
    temp: 0,
    rain: 0,
    stops: 0,
    price: 0
  });

  // Ruler refs for measuring content
  const rulerRefs = {
    score: useRef<HTMLDivElement>(null),
    temp: useRef<HTMLDivElement>(null),
    rain: useRef<HTMLDivElement>(null),
    stops: useRef<HTMLDivElement>(null),
    price: useRef<HTMLDivElement>(null)
  };

  // Effect to measure content whenever results or language changes
  useLayoutEffect(() => {
    const measure = () => {
      const newWidths = { ...colWidths };
      let changed = false;

      (Object.keys(rulerRefs) as Array<keyof typeof rulerRefs>).forEach(key => {
        const ref = rulerRefs[key];
        if (ref.current) {
          // Measure the width and add padding buffer (px-1.5 = 12px total)
          const width = Math.ceil(ref.current.getBoundingClientRect().width) + 12;
          if (width !== colWidths[key]) {
            newWidths[key] = width;
            changed = true;
          }
        }
      });

      if (changed) {
        setColWidths(newWidths);
      }
    };

    measure();
  }, [results, t, formatPrice]);

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
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
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
            className={`ml-auto px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
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
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
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
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
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
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
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
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium cursor-pointer"
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
                <button onClick={() => toggleRegion(region)} className="hover:text-indigo-600 cursor-pointer">
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
                <button onClick={() => toggleCountry(country)} className="hover:text-indigo-600 cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {filters.maxPrice !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">
                ≤ {formatPrice(filters.maxPrice)}
                <button onClick={() => setFilters(prev => ({ ...prev, maxPrice: null }))} className="hover:text-indigo-600 cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            {filters.minTemp !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">
                ≥ {filters.minTemp}°C
                <button onClick={() => setFilters(prev => ({ ...prev, minTemp: null }))} className="hover:text-indigo-600 cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            {filters.directOnly && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">
                {t('direct')}
                <button onClick={() => setFilters(prev => ({ ...prev, directOnly: false }))} className="hover:text-indigo-600 cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
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
            className="mt-4 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium cursor-pointer"
          >
            {t('clearFilters')}
          </button>
        </div>
      ) : (
        <div 
          className="space-y-4"
          style={{
            // @ts-ignore
            '--col-score': `${colWidths.score}px`,
            '--col-temp': `${colWidths.temp}px`,
            '--col-rain': `${colWidths.rain}px`,
            '--col-stops': `${colWidths.stops}px`,
            '--col-price': `${colWidths.price}px`,
          }}
        >
          {/* Hidden measurement ruler */}
          <div className="sr-only invisible h-0 overflow-hidden flex" aria-hidden="true">
            <div ref={rulerRefs.score} className="px-1.5 py-1 font-bold text-base flex flex-col items-center">
              <span className="text-xs flex items-center gap-1">
                {t('score')}
                <div className="w-3 h-3" />
              </span>
              <span>10.0</span>
            </div>
            <div ref={rulerRefs.temp} className="px-1.5 py-1 font-bold text-base flex flex-col items-center">
              <span className="text-xs">{t('temperature')}</span>
              <span>-10.4°C</span>
            </div>
            <div ref={rulerRefs.rain} className="px-1.5 py-1 font-bold text-base flex flex-col items-center">
              <span className="text-xs">{t('rainfall')}</span>
              <span>10.5mm</span>
            </div>
            <div ref={rulerRefs.stops} className="px-1.5 py-1 font-bold text-base flex flex-col items-center">
              <span className="text-xs">{t('stopsLabel')}</span>
              <span>{t('direct')}</span>
            </div>
            <div ref={rulerRefs.price} className="px-1.5 py-1 font-bold text-lg flex flex-col items-center">
              <span className="text-xs">{t('price')}</span>
              <span>{formatPrice(1234.56)}</span>
            </div>
          </div>

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
  const { formatPrice } = useCurrency();
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

  // Build Google Flights URL only when we know the exact departure airport
  // For SerpAPI with country/city kgmid, origin_airport won't be set since SerpAPI doesn't return it
  const googleFlightsUrl = result.origin_airport
    ? buildGoogleFlightsUrl(result.origin_airport, result.airport, result.best_departure, result.best_return)
    : null;

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
                {formatPrice(result.flight_price)}
              </div>
            </div>
          </div>

          {/* Stats Grid - 2x2 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${isHighlighted('score') ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('score')}</span>
              <span className={`text-sm font-semibold whitespace-nowrap ${isHighlighted('score') ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                {result.score.toFixed(1)}
              </span>
            </div>
            <div className={`px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${isHighlighted('temperature') ? 'bg-orange-100 dark:bg-orange-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('temperature')}</span>
              <span className={`text-sm font-semibold whitespace-nowrap ${isHighlighted('temperature') ? 'text-orange-700 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                {result.avg_temp_c.toFixed(1)}°C
              </span>
            </div>
            <div className={`px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${isHighlighted('rainfall') ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('rainfall')}</span>
              <span className={`text-sm font-semibold whitespace-nowrap ${isHighlighted('rainfall') ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                {result.avg_precip_mm_per_day.toFixed(1)} mm
              </span>
            </div>
            <div className="px-1.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex flex-col items-center justify-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('stopsLabel')}</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                {result.total_stops === 0 ? t('direct') : `${result.total_stops}`}
              </span>
            </div>
          </div>

          {/* Bottom row: Dates, Airline, and Book button */}
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
          {/* Book button row on mobile */}
          {googleFlightsUrl && (
            <div className="pt-2">
              <a
                href={googleFlightsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
                {t('viewOnGoogleFlights')}
              </a>
            </div>
          )}
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

            {/* Google Flights button */}
            {googleFlightsUrl && (
              <a
                href={googleFlightsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                title={t('viewOnGoogleFlights')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
                {t('book')}
              </a>
            )}

            {/* Stats - using dynamic widths from CSS variables */}
            <div className="grid grid-cols-5 gap-2 flex-shrink-0" style={{ 
              gridTemplateColumns: 'var(--col-score, 70px) var(--col-temp, 90px) var(--col-rain, 90px) var(--col-stops, 80px) var(--col-price, 100px)' 
            }}>
              {/* Score with tooltip */}
              <div
                ref={scoreButtonRef}
                onMouseEnter={() => handleScoreHover(true)}
                onMouseLeave={() => handleScoreHover(false)}
                className={`relative px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${
                  isHighlighted('score')
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-2 ring-indigo-500'
                    : 'bg-gray-100 dark:bg-gray-700/50'
                }`}
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 whitespace-nowrap">
                  {t('score')}
                  <svg className="w-3 h-3 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <span className={`text-base font-bold whitespace-nowrap ${isHighlighted('score') ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                  {result.score.toFixed(1)}
                </span>
              </div>

              {/* Temperature */}
              <div className={`px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${
                isHighlighted('temperature')
                  ? 'bg-orange-100 dark:bg-orange-900/40 ring-2 ring-orange-500'
                  : 'bg-gray-100 dark:bg-gray-700/50'
              }`}>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('temperature')}</span>
                <span className={`text-base font-bold whitespace-nowrap ${isHighlighted('temperature') ? 'text-orange-700 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                  {result.avg_temp_c.toFixed(1)}°C
                </span>
              </div>

              {/* Rainfall */}
              <div className={`px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${
                isHighlighted('rainfall')
                  ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500'
                  : 'bg-gray-100 dark:bg-gray-700/50'
              }`}>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('rainfall')}</span>
                <span className={`text-base font-bold whitespace-nowrap ${isHighlighted('rainfall') ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                  {result.avg_precip_mm_per_day.toFixed(1)}mm
                </span>
              </div>

              {/* Stops */}
              <div className="px-1.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('stopsLabel')}</span>
                <span className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">
                  {result.total_stops === 0 ? t('direct') : result.total_stops}
                </span>
              </div>

              {/* Price */}
              <div className={`px-1.5 py-1 rounded-lg flex flex-col items-center justify-center ${
                isHighlighted('price')
                  ? 'bg-green-100 dark:bg-green-900/40 ring-2 ring-green-500'
                  : 'bg-green-50 dark:bg-green-900/20'
              }`}>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('price')}</span>
                <span className={`text-lg font-bold whitespace-nowrap ${isHighlighted('price') ? 'text-green-700 dark:text-green-300' : 'text-green-600 dark:text-green-400'}`}>
                  {formatPrice(result.flight_price)}
                </span>
              </div>
            </div>

            {/* Airline - right aligned with fixed width to anchor other tiles */}
            <div className="flex-shrink-0 w-[170px] flex flex-col items-end justify-center">
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
