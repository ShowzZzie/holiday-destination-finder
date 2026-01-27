# Holiday Destination Finder

A full-stack web application that helps travelers discover the best holiday destinations by intelligently balancing **flight prices** and **weather quality**. The system searches across multiple flight providers, analyzes weather data, and ranks destinations using a composite scoring algorithm.

## 🎯 Overview

Holiday Destination Finder (HDF) is a Python backend + Next.js frontend application that:

- Searches for the cheapest round-trip flights across **multiple providers** (Amadeus, Ryanair, Wizz Air, SerpAPI)
- Supports both **airport-level** (IATA codes) and **country/city-level** (Google Knowledge Graph IDs) origin searches
- Fetches historical/forecasted weather data for each destination
- Computes a composite score balancing price, weather, and flight quality
- Displays ranked results in a beautiful, responsive web interface
- Supports **parallel processing** for fast searches across 100+ destinations
- Implements **async job processing** with Redis queue for scalable web deployment

## ✨ Features

### Backend

- **Multi-provider flight search**: 
  - **Amadeus**: Official REST API with OAuth2 authentication and retry logic
  - **Ryanair**: Uses `ryanair-py` package (no API key required)
  - **Wizz Air**: Uses `fli` package (no API key required)
  - **SerpAPI**: Google Flights scraping service (discovers destinations automatically)
- **Flexible origin support**: 
  - IATA airport codes (e.g., `WRO`, `LHR`, `JFK`)
  - Google Knowledge Graph IDs for countries (e.g., `/m/05qhw` for Poland)
  - Google Knowledge Graph IDs for cities (e.g., `/m/04jpl` for London)
  - Automatic expansion of country/city origins to multiple airports
- **Weather integration**: Open-Meteo API for historical/forecasted weather data
- **Composite scoring**: Combines price, temperature, rainfall, and flight stops
- **Parallel processing**: ThreadPoolExecutor for concurrent destination processing
  - 10 workers locally (faster processing)
  - 3 workers on web deployment (rate limit friendly)
- **Job queue system**: Redis-based queue for async job processing
- **RESTful API**: FastAPI with comprehensive input validation
- **Progress tracking**: Real-time progress updates during search with queue position
- **Job cancellation**: Cancel queued or running searches
- **Rate limiting**: IP-based rate limiting (30 requests/hour) with Redis
- **API key authentication**: Optional API key protection for production
- **Currency detection**: Automatic currency detection via IPAPI.co
- **Weather caching**: Thread-safe in-memory cache to avoid redundant API calls

### Frontend

- **Modern UI**: Next.js 16 with React 19, Tailwind CSS v4
- **Dark/Light mode**: Toggleable theme with system preference detection
- **Internationalization**: Support for 6 languages (English, Polish, Spanish, Portuguese, German, French)
- **Job history sidebar**: View and manage previous searches with drag-and-drop reordering
- **Real-time updates**: Live progress tracking with queue position and current destination
- **Job cancellation**: Cancel ongoing or queued searches
- **Responsive design**: Mobile-friendly interface
- **Beautiful results**: Flag backgrounds, airline logos, and detailed flight information
- **Google Flights integration**: Direct booking links with automatic origin resolution
- **Multi-airport origin support**: Visual indication when searching from multiple airports

## 🏗️ Architecture

### Project Structure

```
holiday-destination-finder/
├── data/
│   ├── cities_local.csv      # Full destination list (119 cities) for local runs
│   └── cities_web.csv        # Curated list (43 cities) for web deployment
├── frontend/                  # Next.js frontend application
│   ├── app/
│   │   ├── components/       # React components
│   │   │   ├── DateRangePicker.tsx
│   │   │   └── Header.tsx
│   │   ├── contexts/         # React contexts
│   │   │   ├── CurrencyContext.tsx
│   │   │   ├── LanguageContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── flight-loading/  # Flight loading page
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Main search page
│   │   └── globals.css        # Global styles
│   ├── lib/
│   │   ├── api.ts            # API client
│   │   ├── airports.ts       # Airport data and utilities
│   │   └── country-flags.ts  # Flag utilities
│   └── package.json
├── src/holiday_destination_finder/
│   ├── api.py                # FastAPI application with endpoints
│   ├── main.py               # Core search logic with parallel processing
│   ├── worker.py             # Background worker for job processing
│   ├── kv_queue.py           # Redis queue management
│   ├── scoring.py            # Scoring algorithm implementation
│   ├── config.py             # Logging configuration
│   ├── airports.py           # Airport expansion and origin utilities
│   ├── models.py             # Data models (currently empty)
│   ├── utils.py              # Utility functions
│   └── providers/            # Flight and weather providers
│       ├── amadeus.py        # Amadeus API integration
│       ├── ryanair_test.py  # Ryanair integration
│       ├── wizzair_test.py  # Wizz Air integration
│       ├── serpapi_test.py  # SerpAPI integration
│       └── openmeteo.py     # Weather API integration
├── requirements.txt          # Python dependencies
├── pyproject.toml           # Python project configuration
└── README.md
```

### System Components

1. **FastAPI Backend** (`api.py`): 
   - RESTful API with job queue endpoints
   - Input validation for all parameters
   - Rate limiting and API key authentication
   - CORS configuration for frontend access
   - Embedded worker thread startup

2. **Worker Thread** (`worker.py`): 
   - Background worker that processes jobs from Redis queue
   - Polls queue using `BLPOP` (blocking pop)
   - Handles job cancellation checks
   - Progress callback integration
   - Error handling and job status updates

3. **Search Engine** (`main.py`): 
   - Parallel destination processing with ThreadPoolExecutor
   - Provider-agnostic search orchestration
   - Origin expansion (kgmid → airports)
   - Multi-airport origin support
   - Weather caching with thread-safe locks
   - Provider-specific search paths (SerpAPI vs CSV-based)

4. **Next.js Frontend**: 
   - React-based UI with real-time job status polling
   - Context-based state management (theme, language, currency)
   - Job history persistence in localStorage
   - Responsive design with Tailwind CSS

5. **Redis Queue**: 
   - Job queue for async processing (`queue:jobs` list)
   - Job status tracking (`job:{id}` hash)
   - TTL-based expiration (1 hour)
   - Rate limiting storage

### Design Decisions

#### Why FastAPI?
- **Performance**: FastAPI is one of the fastest Python web frameworks
- **Type safety**: Built-in Pydantic validation
- **Async support**: Native async/await support (though we use sync workers)
- **Documentation**: Automatic OpenAPI/Swagger documentation
- **Developer experience**: Excellent error messages and IDE support

#### Why Redis Queue?
- **Scalability**: Decouples API requests from long-running searches
- **Reliability**: Jobs persist across server restarts (with TTL)
- **Rate limiting**: Redis is perfect for distributed rate limiting
- **Simplicity**: Simple list-based queue with blocking operations
- **Cost**: Redis is available on most hosting platforms

#### Why ThreadPoolExecutor?
- **Simplicity**: Built into Python standard library
- **I/O-bound operations**: Perfect for network requests (flight/weather APIs)
- **Control**: Easy to configure worker count per environment
- **Compatibility**: Works well with sync code (no async/await complexity)

#### Why SerpAPI?
- **Destination discovery**: Automatically finds destinations (no CSV needed)
- **Google Flights data**: Accesses Google Flights pricing
- **Date range**: Supports searches up to ~6 months ahead
- **Fallback**: Automatically falls back to Ryanair+Wizzair for far-future dates

#### Why Open-Meteo?
- **Free**: No API key required
- **Historical data**: Can fetch past weather for analysis
- **Forecast data**: Can fetch future weather predictions
- **Reliable**: Good uptime and response times

#### Why Next.js?
- **React framework**: Modern React with Server Components
- **Performance**: Built-in optimizations (code splitting, image optimization)
- **Developer experience**: Excellent tooling and TypeScript support
- **Deployment**: Easy deployment on Vercel
- **SEO**: Server-side rendering capabilities

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **Redis** (for job queue - required for web deployment)
- **Amadeus API credentials** (optional, for Amadeus provider)
- **SerpAPI key** (optional, for SerpAPI provider)
- **Browserless.io API key** (optional, for origin airport resolution)

### Backend Setup

1. **Clone the repository**:
```bash
git clone <repository-url>
cd holiday-destination-finder
```

2. **Create a virtual environment**:
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. **Install Python dependencies**:
```bash
pip install -r requirements.txt
```

4. **Set up environment variables**:

Create a `.env` file or export the following:

```bash
# Required for web deployment
export REDIS_URL="redis://localhost:6379/0"  # Or your Redis URL

# Optional: Amadeus API (for Amadeus provider)
export AMADEUS_API_KEY_V2TEST="your_key"
export AMADEUS_API_SECRET_V2TEST="your_secret"

# Optional: SerpAPI (for SerpAPI provider)
export SERPAPI_API_KEY="your_key"

# Optional: Browserless.io (for origin airport resolution)
export BROWSERLESS_API_KEY="your_key"

# Optional: API key for production (leave unset for dev mode)
export API_KEY="your_api_key"

# Optional: Currency detection
export USER_LOCAL_CURRENCY="EUR"  # Auto-detected via IPAPI if not set
export FLI_SOURCE_CCY="EUR"      # Currency for Wizz Air prices

# Environment detection
export RENDER="true"  # Set to "true" when deployed on Render (uses cities_web.csv)

# Optional: CORS origins (comma-separated, defaults to Vercel + localhost)
export CORS_ORIGINS="https://yourdomain.com,http://localhost:3000"
```

5. **Start Redis** (if running locally):
```bash
redis-server
# Or use Docker:
docker run -d -p 6379:6379 redis:alpine
```

6. **Run the backend**:

For development:
```bash
uvicorn holiday_destination_finder.api:app --reload --host 0.0.0.0 --port 8000
```

For production (with single worker):
```bash
uvicorn holiday_destination_finder.api:app --workers 1 --host 0.0.0.0 --port 8000
```

**Important**: Use `--workers 1` to avoid spawning multiple worker threads. The worker is started as a daemon thread in `api.py`, so multiple uvicorn workers would create duplicate workers.

### Frontend Setup

1. **Navigate to frontend directory**:
```bash
cd frontend
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure API URL** (optional):

Create `frontend/.env.local`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Default is `https://holiday-destination-finder.onrender.com` (production backend).

4. **Start development server**:
```bash
npm run dev
```

5. **Open browser**: Navigate to [http://localhost:3000](http://localhost:3000)

### CLI Usage (Alternative)

You can also run the search directly from the command line (bypasses the API):

```bash
python3 -m holiday_destination_finder.main \
  --origin WRO \
  --start 2026-05-01 \
  --end 2026-05-31 \
  --trip_length 7 \
  --providers wizzair,ryanair \
  --top_n 10
```

Or use a country/city origin:
```bash
python3 -m holiday_destination_finder.main \
  --origin /m/05qhw \
  --start 2026-05-01 \
  --end 2026-05-31 \
  --trip_length 7 \
  --providers serpapi \
  --top_n 10
```

## 📊 API Endpoints

### `GET /search`
Start a new search job. Returns immediately with a job ID.

**Query Parameters**:
- `origin` (string, default: "WRO"): Origin airport IATA code or kgmid (e.g., `WRO`, `/m/05qhw`)
- `start` (date, required): Start date (YYYY-MM-DD)
- `end` (date, required): End date (YYYY-MM-DD)
- `trip_length` (int, default: 7): Trip length in days (1-65)
- `providers` (list[str], default: ["ryanair", "wizzair"]): Flight providers (`amadeus`, `ryanair`, `wizzair`, `serpapi`)
- `top_n` (int, default: 10): Number of top results to return (1-50)

**Response**:
```json
{
  "job_id": "uuid-string"
}
```

**Rate Limited**: 30 requests per hour per IP address

### `GET /jobs/{job_id}`
Get job status and results.

**Response** (queued):
```json
{
  "job_id": "uuid",
  "status": "queued",
  "queue_position": 1
}
```

**Response** (running):
```json
{
  "job_id": "uuid",
  "status": "running",
  "processed": 45,
  "total": 119,
  "current": "Barcelona (BCN)",
  "origin_airport": "WAW",
  "origin_airport_idx": 2,
  "origin_airport_total": 6
}
```

**Response** (done):
```json
{
  "job_id": "uuid",
  "status": "done",
  "payload": {
    "meta": {
      "origin": "WRO",
      "start": "2026-05-01",
      "end": "2026-05-31",
      "trip_length": 7,
      "providers": ["ryanair", "wizzair"],
      "top_n": 10
    },
    "results": [
      {
        "city": "Barcelona",
        "country": "Spain",
        "airport": "BCN",
        "avg_temp_c": 22.5,
        "avg_precip_mm_per_day": 0.3,
        "flight_price": 89.99,
        "currency": "EUR",
        "total_stops": 0,
        "airlines": "Ryanair",
        "best_departure": "2026-05-15",
        "best_return": "2026-05-22",
        "score": 87.5,
        "origin_airport": "WRO"
      }
    ]
  }
}
```

**Response** (failed):
```json
{
  "job_id": "uuid",
  "status": "failed",
  "error": "Error message with traceback"
}
```

### `POST /jobs/{job_id}/cancel`
Cancel a queued or running job.

**Response**:
```json
{
  "status": "cancelled",
  "job_id": "uuid"
}
```

### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "ok"
}
```

### `GET /resolve-departure` (Advanced)
Resolve the cheapest departure airport when searching from a country/city umbrella using Browserless.io.

**Query Parameters**:
- `origin` (string, required): Origin kgmid (e.g., `/m/05qhw` for Poland)
- `destination` (string, required): Destination IATA code (e.g., `VLC`)
- `departure` (date, required): Departure date (YYYY-MM-DD)
- `return` (date, required): Return date (YYYY-MM-DD)
- `debug` (bool, default: false): Include debug info from Browserless

**Response**:
```json
{
  "airport": "WAW",
  "source": "fly_from_notification",
  "debug": {...}
}
```

### `GET /google-flights-url` (Advanced)
Build a Google Flights URL, optionally resolving the cheapest origin airport.

**Query Parameters**:
- `origin` (string, required): Origin kgmid or IATA code
- `destination` (string, required): Destination IATA code
- `departure` (date, required): Departure date (YYYY-MM-DD)
- `return` (date, required): Return date (YYYY-MM-DD)
- `resolve` (bool, default: true): Resolve cheapest origin airport when using kgmid
- `debug` (bool, default: false): Include debug info

**Response**:
```json
{
  "url": "https://www.google.com/travel/flights?hl=en&gl=us&curr=EUR&tfs=...",
  "origin": "WAW",
  "source": "browserless",
  "resolved_airport": "WAW",
  "debug": {...}
}
```

## 🔧 Configuration

### Flight Providers

#### Amadeus
- **Type**: Official REST API
- **Authentication**: OAuth2 with automatic token refresh
- **Rate Limits**: Handles 429 errors with exponential backoff
- **Credentials**: Requires `AMADEUS_API_KEY_V2TEST` and `AMADEUS_API_SECRET_V2TEST`
- **Use case**: Comprehensive flight search with many airlines

#### Ryanair
- **Type**: Python package (`ryanair-py`)
- **Authentication**: None required
- **Rate Limits**: Moderate (be careful with parallel requests)
- **Use case**: Budget airline coverage in Europe

#### Wizz Air
- **Type**: Python package (`fli`)
- **Authentication**: None required
- **Rate Limits**: Moderate
- **Use case**: Budget airline coverage in Europe and beyond
- **Currency**: Set via `FLI_SOURCE_CCY` environment variable

#### SerpAPI
- **Type**: Google Flights scraping service
- **Authentication**: Requires `SERPAPI_API_KEY`
- **Rate Limits**: Based on your SerpAPI plan
- **Use case**: 
  - Automatic destination discovery
  - Searches up to ~6 months ahead
  - Falls back to Ryanair+Wizzair for far-future dates
- **Advantage**: No CSV needed, discovers destinations automatically

### Origin Types

The system supports three types of origins:

1. **IATA Airport Code** (e.g., `WRO`, `LHR`, `JFK`)
   - Direct airport search
   - Single origin

2. **Country kgmid** (e.g., `/m/05qhw` for Poland)
   - Expands to all airports in that country
   - Searches from each airport, keeps best result per destination
   - Example: Poland → WRO, WAW, KRK, GDN, POZ, WMI

3. **City kgmid** (e.g., `/m/04jpl` for London)
   - Expands to all airports in that city
   - Searches from each airport, keeps best result per destination
   - Example: London → LHR, LGW, STN, LTN

**Supported Countries**: Poland, United Kingdom, Germany, Spain, France, Italy, Portugal, Greece, Netherlands, Turkey, USA, Switzerland, Austria, Denmark, Norway, Sweden, Ireland, Croatia, Czech Republic, Hungary, Romania, Bulgaria

### Destination Lists

- **`cities_local.csv`**: Full list of 119 destinations for local development
  - More comprehensive coverage
  - Longer processing time (~8-10 minutes with 10 workers)

- **`cities_web.csv`**: Curated list of 43 popular destinations for web deployment
  - Faster processing (~3-4 minutes with 3 workers)
  - Popular destinations only
  - Better user experience

The system automatically selects the appropriate file based on the `RENDER` environment variable:
- `RENDER="true"` → `cities_web.csv`
- `RENDER` not set → `cities_local.csv`

### Parallel Processing

The system uses a two-level parallelization strategy:

1. **Destination-level parallelism**: Process multiple destinations concurrently
   - **Local runs**: 10 parallel workers (configurable via `max_workers` parameter)
   - **Web deployment**: 3 parallel workers (to avoid rate limits)
   - **Performance**: With 10 workers, processing 119 cities takes approximately **8-10 minutes** (down from 80 minutes sequentially)

2. **Provider-level parallelism**: Within each destination, flight providers are called in parallel
   - Uses `ThreadPoolExecutor(max_workers=3)` for provider calls
   - Reduces latency when multiple providers are enabled

**Why different worker counts?**
- **Local**: More workers = faster processing (no rate limit concerns)
- **Web**: Fewer workers = avoid rate limits and reduce server load

### Weather Caching

The system implements thread-safe weather caching to avoid redundant API calls:

- **Cache key**: `(latitude, longitude, departure_date, return_date)`
- **Thread-safe**: Uses `threading.Lock()` for concurrent access
- **In-memory**: Cache lives for the duration of a search job
- **Benefit**: When multiple flights have the same dates for a destination, weather is fetched only once

## 📈 Scoring Algorithm

The composite score combines multiple factors to rank destinations:

### Price Score (0-100)
Normalized price score based on the price range of all results:

```python
if max_price == min_price:
    price_score = 100.0
else:
    norm = (price - min_price) / (max_price - min_price)
    norm = max(0.0, min(1.0, norm))  # Clamp to [0, 1]
    price_score = 100.0 - 50.0 * norm
```

**Rationale**: Cheaper flights get higher scores, but the difference is capped at 50 points to prevent price from dominating the score.

### Weather Score (0-100)
Combines temperature and precipitation:

**Temperature Component** (60% weight):
- Ideal temperature: **26°C**
- Penalty: 3 points per degree deviation
- Formula: `temp_score = max(0.0, 100.0 - 3.0 * abs(temp - 26.0))`

**Precipitation Component** (40% weight):
- Effective rain calculation:
  - `< 0.2 mm/day`: treated as 0 (dry)
  - `0.2-1.0 mm/day`: treated as 0.5 (light rain)
  - `≥ 1.0 mm/day`: actual value (moderate/heavy rain)
- Formula: `rain_score = max(0, 100 - (effective_rain * 15))`

**Combined**: `weather_score = 0.6 * temp_score + 0.4 * rain_score`

**Rationale**: 
- Temperature is more important than rain (60/40 split)
- Ideal temperature of 26°C balances warmth without being too hot
- Light rain is penalized less than heavy rain

### Stops Penalty
Penalty multiplier for flights with stops:

```python
penalty = max(0.5, 1.0 - 0.1 * total_stops)
```

- **0 stops**: penalty = 1.0 (no penalty)
- **1 stop**: penalty = 0.9 (10% reduction)
- **2 stops**: penalty = 0.8 (20% reduction)
- **3+ stops**: penalty = 0.5 (50% reduction, minimum)

**Rationale**: Direct flights are preferred, but stops don't eliminate a destination entirely.

### Final Composite Score
```python
price_component = price_score * stop_penalty
final_score = 0.4 * price_component + 0.6 * weather_score
```

**Rationale**: 
- Weather is slightly more important than price (60/40 split)
- Stops penalty only affects price component (not weather)
- This ensures destinations with great weather but slightly higher prices can still rank highly

**Example Calculation**:
- Flight: €100, 0 stops, 24°C, 0.1 mm/day rain
- Price range: €50-€200
- Price score: 75.0
- Weather score: 94.0 (temp: 94.0, rain: 100.0)
- Final score: `0.4 * 75.0 * 1.0 + 0.6 * 94.0 = 86.4`

## 🌍 Internationalization

The frontend supports 6 languages:
- English
- Polish
- Spanish
- Portuguese
- German
- French

**Implementation**:
- Language preference saved in `localStorage`
- Persists across sessions
- Context-based translation system (`LanguageContext.tsx`)

## 🎨 Theming

The frontend supports:
- **Light mode**: Clean, bright interface
- **Dark mode**: Dark theme for low-light environments
- **System preference**: Automatically detects and applies system theme

**Implementation**:
- Theme preference saved in `localStorage`
- Prevents FOUC (Flash of Unstyled Content) with inline script in `<head>`
- Context-based theme management (`ThemeContext.tsx`)

## 📦 Dependencies

### Backend

**Core**:
- `fastapi[standard]`: Web framework with validation
- `uvicorn`: ASGI server
- `redis>=5.0.0`: Job queue and rate limiting
- `requests`: HTTP client for API calls
- `python-dotenv`: Environment variable management

**Flight Providers**:
- `ryanair-py`: Ryanair API wrapper
- `flights`: Wizz Air API wrapper (`fli` package)
- `google-search-results`: SerpAPI client
- `serpapi`: Alternative SerpAPI client
- `Authlib`: OAuth2 for Amadeus authentication

**Utilities**:
- `CurrencyConverter`: Currency conversion
- `pandas`: Data manipulation (CSV reading)
- `python-dateutil`: Date parsing and manipulation

### Frontend

**Core**:
- `next@16.1.3`: React framework with App Router
- `react@19.2.3`: UI library
- `react-dom@19.2.3`: React DOM renderer
- `typescript@^5`: Type safety

**Styling**:
- `tailwindcss@^4`: CSS framework
- `@tailwindcss/postcss@^4`: PostCSS plugin
- `tailwind-merge@^3.4.0`: Tailwind class merging utility
- `clsx@^2.1.1`: Conditional class names
- `class-variance-authority@^0.7.1`: Component variant management

**UI Components**:
- `@radix-ui/react-popover@^1.1.15`: Popover component
- `@radix-ui/react-slot@^1.2.4`: Slot component
- `lucide-react@^0.563.0`: Icon library
- `react-day-picker@^9.13.0`: Date picker component
- `date-fns@^4.1.0`: Date manipulation

**Development**:
- `eslint@^9`: Linter
- `eslint-config-next@16.1.3`: Next.js ESLint config
- `@types/node@^20`: Node.js type definitions
- `@types/react@^19`: React type definitions
- `@types/react-dom@^19`: React DOM type definitions

## 🚢 Deployment

### Backend (Render)

1. **Create a new Web Service** on Render

2. **Set environment variables** in Render dashboard:
   - `REDIS_URL`: Your Redis instance URL (use Render's Redis addon)
   - `AMADEUS_API_KEY_V2TEST`: (Optional) Amadeus API key
   - `AMADEUS_API_SECRET_V2TEST`: (Optional) Amadeus API secret
   - `SERPAPI_API_KEY`: (Optional) SerpAPI key
   - `BROWSERLESS_API_KEY`: (Optional) Browserless.io key
   - `API_KEY`: (Optional) API key for authentication
   - `RENDER`: Set to `"true"` (triggers `cities_web.csv` usage)
   - `CORS_ORIGINS`: (Optional) Comma-separated allowed origins

3. **Build command**:
```bash
pip install -r requirements.txt
```

4. **Start command**:
```bash
uvicorn holiday_destination_finder.api:app --workers 1 --host 0.0.0.0 --port $PORT
```

**Important**: 
- Use `--workers 1` to avoid spawning multiple worker threads
- The worker thread is started automatically in `api.py` on startup
- Render provides `$PORT` environment variable

### Frontend (Vercel)

1. **Connect your repository** to Vercel

2. **Set environment variable**:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL (e.g., `https://holiday-destination-finder.onrender.com`)

3. **Deploy**:
   - Vercel will automatically detect Next.js
   - Run `npm run build` automatically
   - Deploy on every push to main branch

**Alternative**: Deploy manually:
```bash
cd frontend
npm run build
vercel deploy
```

### Redis Setup

**Render**: Use Render's Redis addon (recommended)

**Self-hosted**: 
```bash
docker run -d -p 6379:6379 redis:alpine
```

**Redis Cloud**: Free tier available at [redis.com](https://redis.com)

## 🧪 Development

### Running Tests

Currently, the project doesn't include automated tests. Manual testing is done via:

- **CLI**: `python3 -m holiday_destination_finder.main ...`
- **Frontend**: `npm run dev` and test in browser
- **API**: Use `curl` or Postman to test endpoints

**Example API test**:
```bash
# Start a search
curl "http://localhost:8000/search?origin=WRO&start=2026-05-01&end=2026-05-31&trip_length=7&providers=ryanair,wizzair&top_n=5"

# Check job status
curl "http://localhost:8000/jobs/{job_id}"
```

### Code Style

- **Python**: Follow PEP 8
- **TypeScript/React**: ESLint with Next.js config
- **Formatting**: No specific formatter configured (consider adding `black` for Python, `prettier` for frontend)

### Adding a New Provider

1. Create a new file in `src/holiday_destination_finder/providers/`
2. Implement a function that returns flight offers in the format:
   ```python
   [(price, currency, stops, airline, departure_date, return_date), ...]
   ```
3. Add provider name to `_VALID_PROVIDERS` in `main.py` and `api.py`
4. Add provider call in `_process_single_destination()` in `main.py`
5. Update documentation

### Adding a New Language

1. Add translations to `frontend/app/contexts/LanguageContext.tsx`
2. Add language option to language selector component
3. Update this README

## 🐛 Troubleshooting

### Backend Issues

**Redis connection errors**:
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` environment variable
- Verify Redis is accessible from your network

**Amadeus authentication failures**:
- Verify API credentials are correct
- Check token expiration (tokens auto-refresh)
- Review Amadeus API logs for detailed error messages

**Rate limiting**:
- Reduce `max_workers` in `search_destinations()`
- Add delays between provider calls
- Check provider-specific rate limits

**Worker not processing jobs**:
- Ensure Redis is connected
- Check worker logs for errors
- Verify `--workers 1` is used (prevents duplicate workers)

**Origin expansion failures**:
- Verify origin is a valid IATA code or kgmid
- Check `airports.py` for supported countries/cities
- For unsupported origins, use IATA codes directly

### Frontend Issues

**API connection errors**:
- Verify `NEXT_PUBLIC_API_URL` is correct
- Check CORS settings in backend
- Ensure backend is running
- Check browser console for detailed error messages

**Theme not persisting**:
- Clear browser cache and `localStorage`
- Check browser console for errors
- Verify `ThemeContext` is properly initialized

**Language not changing**:
- Verify `LanguageContext` is properly initialized
- Check browser console for translation errors
- Clear `localStorage` and try again

**Job status not updating**:
- Check network tab for polling requests
- Verify job ID is correct
- Check backend logs for job status

### Provider-Specific Issues

**SerpAPI errors**:
- Verify `SERPAPI_API_KEY` is set
- Check SerpAPI quota/plan limits
- Review SerpAPI dashboard for errors

**Ryanair/Wizz Air errors**:
- These providers may have rate limits
- Try reducing parallel workers
- Check provider status pages

**Amadeus 429 errors**:
- System automatically retries with exponential backoff
- Check `amadeus_429_err_count()` for retry statistics
- Consider reducing parallel workers

## 📝 License

No explicit license. All rights reserved by author.

## 🤝 Contributing

This is a prototype project. Pull requests and issues are welcome!

**Areas for contribution**:
- Adding new flight providers
- Improving scoring algorithm
- Adding more languages
- Performance optimizations
- Test coverage
- Documentation improvements

## 🔮 Future Enhancements

- [ ] Add automated tests (unit, integration, e2e)
- [ ] Implement result caching (Redis) for common searches
- [ ] Add more flight providers (EasyJet, Lufthansa, etc.)
- [ ] Support flexible trip lengths (range optimization)
- [ ] Add filters (price ceiling, region, weather preferences)
- [ ] Multi-origin search (compare multiple departure cities)
- [ ] Country-level destination search (discover by country)
- [ ] Export results (CSV, PDF)
- [ ] User accounts and saved searches
- [ ] Email notifications for job completion
- [ ] Real-time WebSocket updates (replace polling)
- [ ] Hotel price integration
- [ ] Travel time/distance considerations
- [ ] Seasonal weather patterns analysis
- [ ] Price trend analysis (historical data)
- [ ] Mobile app (React Native)

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Redis Documentation](https://redis.io/docs/)
- [Open-Meteo API](https://open-meteo.com/)
- [Amadeus API](https://developers.amadeus.com/)
- [SerpAPI Documentation](https://serpapi.com/)

---

**Built with ❤️ using Python, FastAPI, Next.js, and Redis**
