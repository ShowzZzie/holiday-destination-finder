# Holiday Destination Finder

A full-stack web application that helps travelers discover the best holiday destinations by intelligently balancing **flight prices** and **weather quality**. The system searches across multiple flight providers, analyzes weather data, and ranks destinations using a composite scoring algorithm.

## 🎯 Overview

Holiday Destination Finder (HDF) is a Python backend + Next.js frontend application that:

- Searches for the cheapest round-trip flights across **multiple providers** (Amadeus, Ryanair, Wizz Air)
- Fetches historical/forecasted weather data for each destination
- Computes a composite score balancing price, weather, and flight quality
- Displays ranked results in a beautiful, responsive web interface
- Supports **parallel processing** for fast searches across 100+ destinations

## ✨ Features

### Backend
- **Multi-provider flight search**: Amadeus (REST API), Ryanair, Wizz Air
- **Weather integration**: Open-Meteo API for historical/forecasted weather
- **Composite scoring**: Combines price, temperature, rainfall, and flight stops
- **Parallel processing**: ThreadPoolExecutor for concurrent destination processing (10 workers locally, 3 on web)
- **Job queue system**: Redis-based queue for async job processing
- **RESTful API**: FastAPI with job status tracking and cancellation
- **Progress tracking**: Real-time progress updates during search

### Frontend
- **Modern UI**: Next.js 16 with React 19, Tailwind CSS v4
- **Dark/Light mode**: Toggleable theme with system preference detection
- **Internationalization**: Support for 6 languages (English, Polish, Spanish, Portuguese, German, French)
- **Job history sidebar**: View and manage previous searches with drag-and-drop reordering
- **Real-time updates**: Live progress tracking with queue position
- **Job cancellation**: Cancel ongoing or queued searches
- **Responsive design**: Mobile-friendly interface
- **Beautiful results**: Flag backgrounds, airline logos, and detailed flight information

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
│   │   │   └── Header.tsx
│   │   ├── contexts/         # React contexts
│   │   │   ├── LanguageContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Main search page
│   │   └── globals.css        # Global styles
│   ├── lib/
│   │   ├── api.ts            # API client
│   │   └── country-flags.ts   # Flag utilities
│   └── package.json
├── src/holiday_destination_finder/
│   ├── api.py                # FastAPI application
│   ├── main.py               # Core search logic with parallel processing
│   ├── worker.py             # Background worker for job processing
│   ├── kv_queue.py           # Redis queue management
│   ├── scoring.py            # Scoring algorithm
│   ├── config.py             # Configuration
│   ├── models.py             # Data models
│   ├── utils.py              # Utility functions
│   └── providers/            # Flight and weather providers
│       ├── amadeus.py        # Amadeus API integration
│       ├── ryanair_test.py  # Ryanair integration
│       ├── wizzair_test.py  # Wizz Air integration (with SearchDates/SearchFlights)
│       └── openmeteo.py     # Weather API integration
├── requirements.txt          # Python dependencies
├── pyproject.toml           # Python project configuration
└── README.md
```

### System Components

1. **FastAPI Backend** (`api.py`): RESTful API with job queue endpoints
2. **Worker Thread** (`worker.py`): Background worker that processes jobs from Redis queue
3. **Search Engine** (`main.py`): Parallel destination processing with ThreadPoolExecutor
4. **Next.js Frontend**: React-based UI with real-time job status polling
5. **Redis Queue**: Job queue for async processing and status tracking

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **Redis** (for job queue - required for web deployment)
- **Amadeus API credentials** (optional, for Amadeus provider)

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

# Optional: Currency detection
export USER_LOCAL_CURRENCY="EUR"  # Auto-detected via IPAPI if not set
export FLI_SOURCE_CCY="EUR"      # Currency for Wizz Air prices

# Environment detection
export RENDER="true"  # Set to "true" when deployed on Render (uses cities_web.csv)
```

5. **Run the backend**:

For development:
```bash
uvicorn holiday_destination_finder.api:app --reload --host 0.0.0.0 --port 8000
```

For production (with single worker):
```bash
uvicorn holiday_destination_finder.api:app --workers 1 --host 0.0.0.0 --port 8000
```

**Important**: Use `--workers 1` to avoid spawning multiple worker threads.

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

You can also run the search directly from the command line:

```bash
python3 -m holiday_destination_finder.main \
  --origin WRO \
  --start 2026-05-01 \
  --end 2026-05-31 \
  --trip_length 7 \
  --providers wizzair,ryanair \
  --top_n 10
```

## 📊 API Endpoints

### `GET /search`
Start a new search job. Returns immediately with a job ID.

**Query Parameters**:
- `origin` (string, default: "WRO"): Origin airport IATA code
- `start` (date, required): Start date (YYYY-MM-DD)
- `end` (date, required): End date (YYYY-MM-DD)
- `trip_length` (int, default: 7): Trip length in days
- `providers` (list[str], default: ["ryanair", "wizzair"]): Flight providers
- `top_n` (int, default: 10): Number of top results to return

**Response**:
```json
{
  "job_id": "uuid-string"
}
```

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
  "current": "Barcelona (BCN)"
}
```

**Response** (done):
```json
{
  "job_id": "uuid",
  "status": "done",
  "payload": {
    "meta": {...},
    "results": [...]
  }
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

## 🔧 Configuration

### Flight Providers

- **Amadeus**: Requires API credentials. Uses OAuth2 authentication with retry logic.
- **Ryanair**: Uses `ryanair-py` package. No API key required.
- **Wizz Air**: Uses `fli` package. No API key required. Supports `SearchDates` API (web) or `SearchFlights` (local).

### Destination Lists

- **`cities_local.csv`**: Full list of 119 destinations for local development
- **`cities_web.csv`**: Curated list of 43 popular destinations for web deployment

The system automatically selects the appropriate file based on the `RENDER` environment variable.

### Parallel Processing

- **Local runs**: 10 parallel workers (configurable via `max_workers` parameter)
- **Web deployment**: 3 parallel workers (to avoid rate limits)
- **Provider calls**: Within each destination, flight providers are called in parallel

**Performance**: With 10 workers, processing 119 cities takes approximately **8-10 minutes** (down from 80 minutes sequentially).

## 📈 Scoring Algorithm

The composite score combines multiple factors:

### Price Score (0-100)
```
price_score = 100 × (max_price − price) / (max_price − min_price)
```

### Weather Score (0-100)
Ideal temperature range: **20-26°C**

```
temp_score = based on deviation from ideal range (20-26°C)
rain_score = based on precipitation (lower is better)
weather_score = 0.6 × temp_score + 0.4 × rain_score
```

### Stops Penalty
```
penalty = max(0.5, 1 − 0.1 × stops)
```

### Final Composite Score
```
final_score = 0.6 × price_score × penalty + 0.4 × weather_score
```

## 🌍 Internationalization

The frontend supports 6 languages:
- English
- Polish
- Spanish
- Portuguese
- German
- French

Language preference is saved in `localStorage` and persists across sessions.

## 🎨 Theming

The frontend supports:
- **Light mode**: Clean, bright interface
- **Dark mode**: Dark theme for low-light environments
- **System preference**: Automatically detects and applies system theme

Theme preference is saved in `localStorage` and prevents FOUC (Flash of Unstyled Content) with inline script.

## 📦 Dependencies

### Backend
- `fastapi[standard]`: Web framework
- `uvicorn`: ASGI server
- `redis>=5.0.0`: Job queue
- `requests`: HTTP client
- `ryanair-py`: Ryanair API
- `flights`: Wizz Air API (`fli` package)
- `CurrencyConverter`: Currency conversion
- `Authlib`: OAuth2 for Amadeus

### Frontend
- `next@16.1.3`: React framework
- `react@19.2.3`: UI library
- `tailwindcss@^4`: CSS framework
- `typescript@^5`: Type safety

## 🚢 Deployment

### Backend (Render)

1. **Set environment variables** in Render dashboard:
   - `REDIS_URL`: Your Redis instance URL
   - `AMADEUS_API_KEY_V2TEST`: (Optional) Amadeus API key
   - `AMADEUS_API_SECRET_V2TEST`: (Optional) Amadeus API secret
   - `RENDER`: Set to `"true"`

2. **Build command**:
```bash
pip install -r requirements.txt
```

3. **Start command**:
```bash
uvicorn holiday_destination_finder.api:app --workers 1 --host 0.0.0.0 --port $PORT
```

### Frontend (Vercel)

1. **Set environment variable**:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL

2. **Deploy**:
```bash
npm run build
```

Vercel will automatically detect Next.js and deploy.

## 🧪 Development

### Running Tests

Currently, the project doesn't include automated tests. Manual testing is done via:
- CLI: `python3 -m holiday_destination_finder.main ...`
- Frontend: `npm run dev` and test in browser
- API: Use `curl` or Postman to test endpoints

### Code Style

- **Python**: Follow PEP 8
- **TypeScript/React**: ESLint with Next.js config
- **Formatting**: No specific formatter configured (consider adding `black` for Python, `prettier` for frontend)

## 🐛 Troubleshooting

### Backend Issues

**Redis connection errors**:
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` environment variable

**Amadeus authentication failures**:
- Verify API credentials are correct
- Check token expiration (tokens auto-refresh)

**Rate limiting**:
- Reduce `max_workers` in `search_destinations()`
- Add delays between provider calls

### Frontend Issues

**API connection errors**:
- Verify `NEXT_PUBLIC_API_URL` is correct
- Check CORS settings in backend
- Ensure backend is running

**Theme not persisting**:
- Clear browser cache and `localStorage`
- Check browser console for errors

**Language not changing**:
- Verify `LanguageContext` is properly initialized
- Check browser console for translation errors

## 📝 License

No explicit license. All rights reserved by author.

## 🤝 Contributing

This is a prototype project. Pull requests and issues are welcome!

## 🔮 Future Enhancements

- [ ] Add automated tests (unit, integration, e2e)
- [ ] Implement result caching (Redis)
- [ ] Add more flight providers
- [ ] Support flexible trip lengths (range optimization)
- [ ] Add filters (price ceiling, region, weather preferences)
- [ ] Multi-origin search
- [ ] Country-level search
- [ ] Export results (CSV, PDF)
- [ ] User accounts and saved searches
- [ ] Email notifications for job completion

---

**Built with ❤️ using Python, FastAPI, Next.js, and Redis**
