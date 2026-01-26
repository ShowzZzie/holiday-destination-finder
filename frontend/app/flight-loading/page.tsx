'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getGoogleFlightsUrl } from '@/lib/api';

export default function FlightLoadingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Finding the best flight...');

  useEffect(() => {
    const origin = searchParams.get('origin') || '';
    const destination = searchParams.get('destination') || '';
    const departure = searchParams.get('departure') || '';
    const returnDate = searchParams.get('return') || '';

    if (!origin || !destination || !departure || !returnDate) {
      setStatus('Missing flight details. Redirecting to Google Flights...');
      const fallbackQuery = destination ? `flights to ${destination}` : 'flights';
      window.location.replace(`https://www.google.com/travel/flights?q=${encodeURIComponent(fallbackQuery)}`);
      return;
    }

    let cancelled = false;

    const redirectToFlights = async () => {
      try {
        const response = await getGoogleFlightsUrl({
          origin,
          destination,
          departure,
          returnDate,
          resolve: true,
        });

        if (cancelled) return;

        if (response?.url) {
          window.location.replace(response.url);
          return;
        }

        throw new Error(response?.error || 'Missing Google Flights URL');
      } catch {
        if (cancelled) return;
        const fallbackQuery = `flights from ${origin} to ${destination} on ${departure} returning ${returnDate}`;
        window.location.replace(`https://www.google.com/travel/flights?q=${encodeURIComponent(fallbackQuery)}`);
      }
    };

    redirectToFlights();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-indigo-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
      <div className="text-center px-6 py-10 rounded-2xl bg-white/80 dark:bg-gray-900/80 shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full">
        <div className="mx-auto mb-6 w-14 h-14 rounded-full bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
          <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Preparing your Google Flights search
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {status}
        </p>
      </div>
    </main>
  );
}
