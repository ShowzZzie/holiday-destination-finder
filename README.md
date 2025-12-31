# holiday-destination-finder
Tool meant to help with determining the best destination for holidays, taking into account round ticket prices, and temperature at destination city.

**MVP:**
- Departure airport: WRO
- Static list of 50 destinations
- Specific month (e.g. May) or Last 90 Days period selection
- Round-trip only
- Single cheapest fare per city

**MVP Resources to be used:**
- Amadeus Self-Service — to be used for Flight Offer Search API
- Open-Meteo — weather data through API
- Render's Postgres
- Streamlit for UI

**Scoring Model**
- Score = 0.6 * price + 0.4 * weather

**Expected Output**
- Top 10 cities with
    - cheapest round-trip price
    - avg temp + rain probability
    - score