'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { format, isValid, parse, isBefore, isAfter, startOfMonth, endOfMonth, startOfDay } from 'date-fns';
import { enGB } from 'date-fns/locale';
import 'react-day-picker/style.css';
import { DayPicker, CalendarMonth, useDayPicker } from 'react-day-picker';

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

  // When picker opens, sync with current values
  const handleOpen = () => {
    if (disabled) return;

    if (!isOpen) {
      // Opening - sync with current values from parent
      setLocalStart(startDate || '');
      setLocalEnd(endDate || '');
      setSelectingStart(true); // Always start with selecting start date first when opening
    }
    setIsOpen(!isOpen);
  };

  // Handle day click with local state
  const handleDayClick = (day: Date) => {
    const clickedDateStr = format(day, 'yyyy-MM-dd');

    if (selectingStart) {
      // Set local start
      setLocalStart(clickedDateStr);
      
      // If we already have an end date that is before the new start, clear it
      if (localEnd) {
        const parsedEnd = parseDate(localEnd);
        if (parsedEnd && isBefore(parsedEnd, day)) {
          setLocalEnd('');
          onEndChange('');
        }
      }
      
      setSelectingStart(false);
      
      onStartChange(clickedDateStr);
      if (localEnd) {
        const parsedEnd = parseDate(localEnd);
        if (parsedEnd && !isBefore(parsedEnd, day)) {
          onEndChange(localEnd);
        }
      }
    } else {
      // Selecting end
      const currentStart = parseDate(localStart);

      if (currentStart) {
        let finalStart = localStart;
        let finalEnd = clickedDateStr;

        if (isBefore(day, currentStart)) {
          // If clicked before start, make it the new start
          finalStart = clickedDateStr;
          setLocalStart(finalStart);
          // Stay on end selection for the next click
          onStartChange(finalStart);
        } else {
          // Normal end selection
          setLocalEnd(finalEnd);
          onEndChange(finalEnd);
          
          // Close after a short delay for better UX
          setTimeout(() => {
            setIsOpen(false);
          }, 400);
        }
      } else {
        // No start date yet, treat as start
        setLocalStart(clickedDateStr);
        onStartChange(clickedDateStr);
        setSelectingStart(false);
      }
    }
  };

  // Function to select an entire month
  const handleSelectMonth = useCallback((month: Date) => {
    // Always use first day of month as start, last day as end
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const today = startOfDay(new Date());

    // If the whole month is in the past, ignore
    if (isBefore(end, today)) return;

    // Don't select disabled (past) start dates for current month
    const finalStart = isBefore(start, today) ? today : start;

    const startStr = format(finalStart, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    // Update local state
    setLocalStart(startStr);
    setLocalEnd(endStr);
    
    // Update parent state immediately
    onStartChange(startStr);
    onEndChange(endStr);

    // Reset selection mode and close immediately (no perceptible delay)
    setSelectingStart(true);
    setIsOpen(false);
  }, [onStartChange, onEndChange]);

  type MonthCaptionProps = { calendarMonth: CalendarMonth; displayIndex: number } & React.HTMLAttributes<HTMLDivElement>;

  // Month caption:
  // - click month name => select whole month range
  const CustomMonthCaption = useCallback((props: MonthCaptionProps) => {
    const { calendarMonth, displayIndex, className, ...rest } = props;
    const { months, previousMonth, nextMonth, goToMonth } = useDayPicker();
    const monthDate = calendarMonth.date; // first day of the month
    const isFirst = displayIndex === 0;
    const isLast = displayIndex === months.length - 1;

    return (
      <div
        {...rest}
        className={`flex items-center justify-between gap-3 ${className ?? ''}`}
      >
        {/* Left arrow (only on left month) */}
        <div className="w-10 flex items-center justify-start">
          {isFirst && (
            <button
              type="button"
              disabled={!previousMonth}
              onClick={() => previousMonth && goToMonth(previousMonth)}
              className="h-9 w-9 rounded-full border-2 border-gray-300 bg-gray-50 text-gray-900 shadow-sm hover:bg-indigo-50 hover:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:border-gray-400 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-indigo-100"
              aria-label="Previous month"
            >
              <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Month name (click selects entire month) */}
        <div className="flex-1 flex items-center justify-center">
          <button
            type="button"
            onClick={() => isValid(monthDate) && handleSelectMonth(monthDate)}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-gray-900 hover:bg-indigo-50 hover:border-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-indigo-900/30 transition-colors whitespace-nowrap cursor-pointer"
            title="Click to select the whole month"
          >
            <span className="text-[14px] font-bold">
              {format(monthDate, 'MMMM yyyy')}
            </span>
            <svg className="h-4 w-4 text-gray-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>

        {/* Right arrow (only on right month) */}
        <div className="w-10 flex items-center justify-end">
          {isLast && (
            <button
              type="button"
              disabled={!nextMonth}
              onClick={() => nextMonth && goToMonth(nextMonth)}
              className="h-9 w-9 rounded-full border-2 border-gray-300 bg-gray-50 text-gray-900 shadow-sm hover:bg-indigo-50 hover:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:border-gray-400 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-indigo-100"
              aria-label="Next month"
            >
              <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }, [handleSelectMonth]);

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
              <button
                type="button"
                onClick={() => setSelectingStart(true)}
                className={`flex-1 p-2 rounded-lg text-center text-sm font-medium transition-all cursor-pointer ${
                  selectingStart
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <div className="text-xs uppercase tracking-wide mb-0.5 opacity-70">Departure</div>
                <div>{localStart ? formatDisplayDate(localStart) : 'Select...'}</div>
              </button>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <button
                type="button"
                onClick={() => setSelectingStart(false)}
                className={`flex-1 p-2 rounded-lg text-center text-sm font-medium transition-all cursor-pointer ${
                  !selectingStart
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <div className="text-xs uppercase tracking-wide mb-0.5 opacity-70">Return</div>
                <div>{localEnd ? formatDisplayDate(localEnd) : (selectingStart ? '—' : 'Select...')}</div>
              </button>
            </div>
          </div>

          <DayPicker
            mode="range"
            onSelect={() => {}}
            onDayClick={handleDayClick}
            numberOfMonths={2}
            defaultMonth={defaultMonth}
            showOutsideDays={false}
            disabled={{ before: new Date() }}
            modifiers={modifiers}
            locale={enGB}
            formatters={{
              formatWeekdayName: (day) => format(day, 'EEE'),
            }}
            components={{
              MonthCaption: CustomMonthCaption,
              Nav: () => null
            }}
            modifiersClassNames={{
              rangeStart: 'rdp-range-start',
              rangeEnd: 'rdp-range-end',
              rangeMiddle: 'rdp-range-middle',
            }}
            classNames={{
              root: 'rdp-calendar',
              months: 'flex gap-6 flex-col sm:flex-row relative',
              month: 'rdp-month-container',
              month_caption: 'h-12 mb-4',
              caption_label: 'text-base font-bold text-gray-900 dark:text-white',
              weekdays: 'flex mb-1',
              weekday: 'w-10 h-8 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tighter',
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
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
