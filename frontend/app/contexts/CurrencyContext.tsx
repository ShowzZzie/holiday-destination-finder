'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

type Currency = 'EUR' | 'USD' | 'GBP' | 'PLN' | 'CHF' | 'SEK' | 'NOK' | 'DKK' | 'CZK' | 'HUF';

interface ExchangeRates {
  [key: string]: number;
}

interface CachedRates {
  rates: ExchangeRates;
  timestamp: number;
}

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatPrice: (eurAmount: number) => string;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Currency symbols and display info
const CURRENCY_INFO: Record<Currency, { symbol: string; name: string; position: 'before' | 'after' }> = {
  EUR: { symbol: '€', name: 'Euro', position: 'before' },
  USD: { symbol: '$', name: 'US Dollar', position: 'before' },
  GBP: { symbol: '£', name: 'British Pound', position: 'before' },
  PLN: { symbol: 'zł', name: 'Polish Złoty', position: 'after' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', position: 'before' },
  SEK: { symbol: 'kr', name: 'Swedish Krona', position: 'after' },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', position: 'after' },
  DKK: { symbol: 'kr', name: 'Danish Krone', position: 'after' },
  CZK: { symbol: 'Kč', name: 'Czech Koruna', position: 'after' },
  HUF: { symbol: 'Ft', name: 'Hungarian Forint', position: 'after' },
};

// Fallback rates (approximate) in case API fails
const FALLBACK_RATES: ExchangeRates = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.86,
  PLN: 4.32,
  CHF: 0.94,
  SEK: 11.20,
  NOK: 11.50,
  DKK: 7.46,
  CZK: 25.10,
  HUF: 395.00,
};

const CACHE_KEY = 'exchangeRates';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'PLN', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF'];

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('EUR');
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Fetch exchange rates from Frankfurter API
  const fetchRates = useCallback(async (): Promise<ExchangeRates> => {
    try {
      const currencies = CURRENCIES.filter(c => c !== 'EUR').join(',');
      const response = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${currencies}`);

      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }

      const data = await response.json();
      return { EUR: 1, ...data.rates };
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      return FALLBACK_RATES;
    }
  }, []);

  // Load rates from cache or fetch fresh
  const loadRates = useCallback(async () => {
    setIsLoading(true);

    try {
      // Check localStorage for cached rates
      const cachedData = localStorage.getItem(CACHE_KEY);

      if (cachedData) {
        const cached: CachedRates = JSON.parse(cachedData);
        const now = Date.now();

        // Use cached rates if still valid
        if (now - cached.timestamp < CACHE_DURATION_MS) {
          setRates(cached.rates);
          setIsLoading(false);
          return;
        }
      }

      // Fetch fresh rates
      const freshRates = await fetchRates();
      setRates(freshRates);

      // Cache the rates
      const cacheData: CachedRates = {
        rates: freshRates,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error loading rates:', error);
      setRates(FALLBACK_RATES);
    } finally {
      setIsLoading(false);
    }
  }, [fetchRates]);

  // Initialize on mount
  useEffect(() => {
    setMounted(true);

    // Load saved currency preference
    const savedCurrency = localStorage.getItem('currency') as Currency | null;
    if (savedCurrency && CURRENCIES.includes(savedCurrency)) {
      setCurrencyState(savedCurrency);
    }

    // Load exchange rates
    loadRates();
  }, [loadRates]);

  // Save currency preference when it changes
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('currency', currency);
  }, [currency, mounted]);

  const setCurrency = (newCurrency: Currency) => {
    if (CURRENCIES.includes(newCurrency)) {
      setCurrencyState(newCurrency);
    }
  };

  const formatPrice = (eurAmount: number): string => {
    const rate = rates[currency] || 1;
    const convertedAmount = eurAmount * rate;
    const info = CURRENCY_INFO[currency];

    // Round to whole number for cleaner display
    const rounded = Math.round(convertedAmount);

    // Format with thousand separators
    const formatted = rounded.toLocaleString('en-US');

    if (info.position === 'before') {
      return `${info.symbol}${formatted}`;
    } else {
      return `${formatted} ${info.symbol}`;
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice, isLoading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export { CURRENCY_INFO };
