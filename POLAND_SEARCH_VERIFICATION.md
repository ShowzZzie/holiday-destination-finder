# Poland Search Verification

This document verifies that searching for Poland (kgmid `/m/05qhw`) with extended dates works correctly.

## Test Results

✅ **ALL TESTS PASSED**

## Complete Flow Verification

### 1. Frontend Flow

**User Action:**
- User types "Poland" in origin field
- User selects dates far in future (e.g., Aug 2026)

**Frontend Behavior:**
1. `selectSuggestion` sets `origin: "/m/05qhw"` (Poland's kgmid)
2. `isExtendedDateRange` detects extended dates
3. Auto-switches providers to `['ryanair', 'wizzair']`
4. **Origin is preserved** (not cleared) ✅
5. Form submits with:
   - `origin: "/m/05qhw"`
   - `providers: ['ryanair', 'wizzair']`
   - Extended date range

### 2. Backend Flow

**Entry Point:** `search_destinations()` in `main.py`

**Step 1: Provider Check**
- Providers = `['ryanair', 'wizzair']` (not `['serpapi']`)
- Goes to line 786: `expand_origin_to_airports(origin)`

**Step 2: Origin Expansion**
- Input: `"/m/05qhw"` (Poland kgmid)
- `expand_origin_to_airports()` finds Poland in COUNTRIES
- Returns: `['WRO', 'WAW', 'WMI', 'KRK', 'GDN', 'POZ']` ✅
- All 6 Polish airports found

**Step 3: Multi-Airport Search**
- `len(origin_airports) = 6 > 1`
- Triggers `_search_multi_airport()` ✅
- Iterates through each airport:
  1. WRO (Wrocław)
  2. WAW (Warsaw Chopin)
  3. WMI (Warsaw Modlin)
  4. KRK (Kraków)
  5. GDN (Gdańsk)
  6. POZ (Poznań)

**Step 4: Processing Each Airport**
- For each airport, `_process_single_destination()` is called
- Searches all destinations from CSV
- Uses ryanair/wizzair providers ✅
- Results are deduplicated by destination (keeps cheapest)

**Step 5: Results**
- All results merged and deduplicated
- Scored and sorted
- Top N results returned

### 3. Fallback Scenario (SerpAPI → Ryanair/Wizzair)

**Scenario:** User initially uses serpapi, but dates are too far

**Flow:**
1. `_search_with_serpapi()` is called
2. SerpAPI throws `SerpApiBeyondRangeError`
3. Falls back to `_search_with_fallback_providers()`
4. **Fallback function expands kgmid** ✅ (line 413)
5. If multiple airports → calls `_search_multi_airport()` ✅
6. All airports processed with ryanair/wizzair

## Verification Checklist

- ✅ Poland kgmid `/m/05qhw` expands to all 6 airports
- ✅ Multi-airport search is triggered for country searches
- ✅ Ryanair/Wizzair providers are used for extended dates
- ✅ Origin field is preserved when switching to extended dates
- ✅ Fallback scenario works correctly
- ✅ Each airport searches all destinations
- ✅ Results are properly deduplicated
- ✅ `origin_airport` field is set correctly for Book button

## Polish Airports

The following airports are searched when using Poland as origin:

1. **WRO** - Wrocław Nicolaus Copernicus Airport
2. **WAW** - Warsaw Chopin Airport
3. **WMI** - Warsaw Modlin Airport
4. **KRK** - John Paul II International Airport Kraków-Balice
5. **GDN** - Gdańsk Lech Wałęsa Airport
6. **POZ** - Poznań-Ławica Airport

## Code Paths Verified

1. **Direct ryanair/wizzair search:**
   - `search_destinations()` → `expand_origin_to_airports()` → `_search_multi_airport()`

2. **SerpAPI fallback:**
   - `_search_with_serpapi()` → `SerpApiBeyondRangeError` → `_search_with_fallback_providers()` → `_search_multi_airport()`

Both paths correctly expand the kgmid and process all airports.
