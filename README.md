# Holiday Destination Finder

## Overview

Holiday Destination Finder (HDF) is a Python application that helps travelers discover attractive holiday destinations by balancing **flight price** and **weather quality**. Given:

- an origin airport (e.g. `WRO`)
- a date window (e.g. `2026-05-01` → `2026-05-31`)
- a fixed trip length (e.g. `7 days`)

HDF searches for the cheapest round-trip flights across multiple providers, fetches historical/forecasted weather for each destination, computes a composite score, and prints the top-ranked results.

The project currently operates as a **CLI MVP**, designed to evolve into a backend API + web UI.

---

## Current Features

- **Multi-provider flight search:**
  - Amadeus (REST, OAuth, retries)
  - Ryanair (`ryanair` package)
  - Wizz Air (`fli` + currency conversion)
- **Weather integration via Open-Meteo**
- **Composite scoring** combining:
  - price
  - weather
  - stops penalty
- **Data-driven destinations** from `data/cities.csv`
- **Pure Python CLI**, no UI yet

---

## Project Structure

```
├── data/
│   └── cities.csv
├── src/holiday_destination_finder/
│   ├── main.py
│   ├── scoring.py
│   └── providers/
│       ├── amadeus.py
│       ├── ryanair_test.py
│       ├── wizzair_test.py
│       └── openmeteo.py
└── README.md
```

---

## How It Works (MVP Logic)

For each city in `cities.csv`:

1. Query enabled flight providers for the cheapest round-trip
2. Extract `(price, currency, stops, airline, dep, ret)`
3. Fetch weather (forecast or climate)
4. Normalize prices globally
5. Compute final score
6. Rank & print top-N to stdout

Typical runtime: **up to 3 minutes** for a 2-month window, and ~15 destinations with Wizz and Ryanair as providers.

---

## Providers (MVP)

| Provider | Purpose | Notes |
|---|---|---|
| **Amadeus** | Scheduled flights | OAuth + retries + rate limits |
| **Ryanair** | EU budget | Direct + cheap |
| **Wizz Air** | EU budget | `fli` + currency conversion |
| **Open-Meteo** | Weather/climate | Free + no token |

---

## Scoring Model (MVP)

**Price score (0–100):**

```
price = 100 × (max_price − price) / (max_price − min_price)
```

**Weather score (0–100):**

Ideal temperature range: `20–26°C`

```
weather_score = 0.6 × temp_score + 0.4 × rain_score
```

**Stops penalty:**

```
penalty = max(0.5, 1 − 0.1 × stops)
```

**Final composite:**

```
final = 0.6 × price_score × penalty + 0.4 × weather_score
```

---

## Usage (CLI MVP)

### Install

```bash
git clone https://github.com/ShowzZzie/holiday-destination-finder
cd holiday-destination-finder
python3 -m venv .venv
source .venv/bin/activate
pip install requests ryanair fli currencyconverter
```

For Amadeus:

```bash
export AMADEUS_API_KEY_V2TEST=<key>
export AMADEUS_API_SECRET_V2TEST=<secret>
```

### Run

```bash
python3 -m holiday_destination_finder.main \
  --origin WRO \
  --start 2026-05-01 \
  --end 2026-05-31 \
  --trip_length 7 \
  --providers wizzair,ryanair,amadeus \
  --top_n 10
```

Example output:

```
1. Dubrovnik (DBV) — Score: 84.90 | EUR 71.98 | Stops: 0 | Airlines: Ryanair | 2026-04-23 → 2026-04-30 | 18.0°C | 4.69mm/day
2. Malaga (AGP) — Score: 80.51 | EUR 89.16 | Stops: 0 | Airlines: Wizz Air | 2026-04-23 → 2026-04-30 | 15.2°C | 2.03mm/day
```

---

## Design Choices (Intentional Trade-Offs)

- Sequential provider calls (simpler, slower, avoids rate-limit chaos)
- Static list of destinations (`cities.csv`)
- Fixed trip length
- STDOUT output only
- No concurrency/caching yet

---

## Limitations (Current MVP)

- Single airport origin
- No flexible trip length
- No country-level search (e.g. `POL`)
- No filters (price ceiling, region, etc.)
- No caching (re-fetch every run)
- No deployment / no API
- Weather + budget providers mostly EU-centric

---

## Roadmap (Next Milestone)

1. FastAPI backend (`/search`)
2. Deploy to Render
3. Add filters
4. Add caching (Redis)
5. Add concurrency (async/workers)
6. Build UI (Streamlit or React)
7. Expand airports (multi-origin, continent filter)
8. Flexible trip lengths (range + optimization)

---

## Contributing

Prototype stage; PRs/issues welcome.

---

## License

No explicit license. All rights reserved by author.
