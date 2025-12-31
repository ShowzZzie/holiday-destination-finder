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
- Score = 0.6 * price_score + 0.4 * weather_score

    - Price Score:
        The best price is below 500 PLN
        Scoring system is 0-100 points

        FORMULA: price_score = 100 * (max_price - price_of_the_trip) / (max_price - min_price) 

        min_price == the cheapest price found

    - Weather Score:
        There are two components for Weather Score: Temperature Score and Rain Score
        FINAL FORMULA: weather_score = 0.6 * temp_score + 0.4 * rain_score
        
        The ideal temperature is between 20-26°C
        Temperature between 15-30°C falls into 'acceptable' range

        TEMPERATURE FORMULA:
        temp_score = 100
        if temp < 20:
            temp_score = max(0, 100 - (20 - temp) * 8)
        elif temp > 26:
            temp_score = max(0, 100 - (temp - 26) * 8)

        
        
        The best range for rain is 0-2 mm/day 
        
        RAIN FORMULA:
        rain_score = max(0, 100 - (rain_mm_per_day * 15))


**Expected Output**
- Top 10 cities with
    - cheapest round-trip price
    - avg temp + rain probability
    - score