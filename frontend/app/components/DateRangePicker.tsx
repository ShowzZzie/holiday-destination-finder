'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, isValid, parse, isBefore, isAfter } from 'date-fns';
import 'react-day-picker/style.css';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  startLabel: string;
  endLabel: string;
  disabled?: boolean;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  startLabel,
  endLabel,
  disabled = false,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // LOCAL state for selection while picker is open - this avoids closure issues
  const [localStart, setLocalStart] = useState<string>('');
  const [localEnd, setLocalEnd] = useState<string>('');
  const [selectingStart, setSelectingStart] = useState(true);

  const parseDate = (dateStr: string): Date | undefined => {
    if (!dateStr) return undefined;
    const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  };

  // When picker opens, reset local state
  const handleOpen = () => {
    if (disabled) return;

    if (!isOpen) {
      // Opening - start fresh selection, ignore current values
      setLocalStart('');
      setLocalEnd('');
      setSelectingStart(true);
    }
    setIsOpen(!isOpen);
  };

  // Handle day click with local state
  const handleDayClick = (day: Date) => {
    const clickedDateStr = format(day, 'yyyy-MM-dd');

    if (selectingStart) {
      // First click - set local start
      setLocalStart(clickedDateStr);
      setLocalEnd('');
      setSelectingStart(false);
    } else {
      // Second click - set local end, then commit to parent
      const currentStart = parseDate(localStart);

      if (currentStart) {
        let finalStart = localStart;
        let finalEnd = clickedDateStr;

        if (isBefore(day, currentStart)) {
          // Swap if clicked before start
          finalStart = clickedDateStr;
          finalEnd = localStart;
        }

        setLocalStart(finalStart);
        setLocalEnd(finalEnd);

        // Commit to parent
        onStartChange(finalStart);
        onEndChange(finalEnd);

        // Close after delay
        setTimeout(() => {
          setIsOpen(false);
          setSelectingStart(true);
        }, 200);
      }
    }
  };

  // Use local values while open, parent values when closed
  const displayStart = isOpen ? localStart : startDate;
  const displayEnd = isOpen ? localEnd : endDate;

  const startParsed = parseDate(displayStart);
  const endParsed = parseDate(displayEnd);

  // Build modifiers for highlighting
  const modifiers: Record<string, Date | Date[] | ((date: Date) => boolean)> = {};
  if (startParsed) {
    modifiers.rangeStart = startParsed;
  }
  if (endParsed) {
    modifiers.rangeEnd = endParsed;
  }
  if (startParsed && endParsed && isAfter(endParsed, startParsed)) {
    modifiers.rangeMiddle = (date: Date) =>
      isAfter(date, startParsed) && isBefore(date, endParsed);
  }

  // Close handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectingStart(true);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSelectingStart(true);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const formatDisplayDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = parseDate(dateStr);
    return date ? format(date, 'MMM d, yyyy') : '';
  };

  // Show current month when opening fresh
  const defaultMonth = startParsed || new Date();

  const daysBetween = startParsed && endParsed
    ? Math.round((endParsed.getTime() - startParsed.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
          bg-white dark:bg-gray-700 text-left
          focus:ring-2 focus:ring-indigo-500 focus:outline-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-500'}
          transition-colors`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="flex items-center gap-2">
              <span className={startDate ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}>
                {startDate ? formatDisplayDate(startDate) : startLabel}
              </span>
              <span className="text-gray-400 dark:text-gray-500">→</span>
              <span className={endDate ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}>
                {endDate ? formatDisplayDate(endDate) : endLabel}
              </span>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 left-0 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-300 dark:border-gray-600 p-4">
          {/* Header */}
          <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className={`flex-1 p-2 rounded-lg text-center text-sm font-medium transition-all ${
                selectingStart
                  ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                <div className="text-xs uppercase tracking-wide mb-0.5 opacity-70">Departure</div>
                <div>{localStart ? formatDisplayDate(localStart) : 'Select...'}</div>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <div className={`flex-1 p-2 rounded-lg text-center text-sm font-medium transition-all ${
                !selectingStart
                  ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                <div className="text-xs uppercase tracking-wide mb-0.5 opacity-70">Return</div>
                <div>{localEnd ? formatDisplayDate(localEnd) : (selectingStart ? '—' : 'Select...')}</div>
              </div>
            </div>
          </div>

          <DayPicker
            mode="single"
            onSelect={() => {}}
            onDayClick={handleDayClick}
            numberOfMonths={2}
            defaultMonth={defaultMonth}
            showOutsideDays={false}
            disabled={{ before: new Date() }}
            modifiers={modifiers}
            modifiersClassNames={{
              rangeStart: 'rdp-range-start',
              rangeEnd: 'rdp-range-end',
              rangeMiddle: 'rdp-range-middle',
            }}
            classNames={{
              root: 'rdp-calendar',
              months: 'flex gap-6 flex-col sm:flex-row',
              month: 'rdp-month-container',
              month_caption: 'flex justify-center items-center h-10 mb-2',
              caption_label: 'text-base font-bold text-gray-900 dark:text-white',
              nav: 'flex items-center',
              button_previous: 'absolute left-4 top-[5.5rem] p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors',
              button_next: 'absolute right-4 top-[5.5rem] p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors',
              weekdays: 'flex mb-1',
              weekday: 'w-10 h-8 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase',
              week: 'flex',
              day: 'w-10 h-10 p-0.5',
              day_button: 'rdp-day-btn',
              today: 'rdp-today',
              outside: 'invisible',
              disabled: 'rdp-disabled',
            }}
          />

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {daysBetween !== null ? (
                <span className="font-medium">{daysBetween} day{daysBetween !== 1 ? 's' : ''}</span>
              ) : !selectingStart ? (
                <span className="text-indigo-600 dark:text-indigo-400">Now select return date</span>
              ) : (
                <span className="text-gray-400">Click a departure date</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setSelectingStart(true);
              }}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
