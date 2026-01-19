# Holiday Destination Finder - Frontend

This is the frontend web application for the Holiday Destination Finder, built with [Next.js](https://nextjs.org), React, and Tailwind CSS.

## Features

- 🔍 Search for holiday destinations by:
  - Origin airport (IATA code)
  - Date window (start and end dates)
  - Trip length in days
  - Flight providers (Ryanair, Wizz Air, Amadeus)
  - Number of top results to display

- 📊 Real-time progress tracking while searching destinations
- 🎯 Beautiful results display with:
  - City and country information
  - Flight prices and currency
  - Weather data (temperature and rainfall)
  - Flight details (stops, airlines, dates)
  - Composite score ranking

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API server running (see main README)

### Installation

1. Install dependencies:

```bash
npm install
```

2. (Optional) Configure API URL:

The app defaults to `https://holiday-destination-finder.onrender.com` (the Render backend).

To use a local backend or different URL, create a `.env.local` file in the frontend directory:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx      # Root layout with metadata
│   ├── page.tsx        # Main search page
│   └── globals.css     # Global styles
├── lib/
│   └── api.ts          # API client for backend communication
└── public/             # Static assets
```

## API Integration

The frontend communicates with the FastAPI backend through:

- `GET /search` - Start a search job
- `GET /jobs/{job_id}` - Poll job status and get results
- `GET /health` - Health check

The app automatically polls job status every 2 seconds when a search is in progress.

## Building for Production

```bash
npm run build
npm start
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [React](https://react.dev)
