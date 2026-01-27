#!/usr/bin/env python3
"""Quick test of API endpoints with client_id handling."""
import sys
import os

# Load .env file
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from fastapi.testclient import TestClient
from holiday_destination_finder.api import app, _get_client_id
from fastapi import Request

# Test _get_client_id function
class MockRequest:
    def __init__(self, headers_dict):
        class Headers:
            def get(self, key, default=None):
                return headers_dict.get(key, default)
        self.headers = Headers()

print("Testing _get_client_id function...")
req1 = MockRequest({'X-Client-ID': 'test-123'})
result1 = _get_client_id(req1)
print(f"✅ With X-Client-ID header: {result1}")

req2 = MockRequest({})
result2 = _get_client_id(req2)
print(f"✅ Without header: {result2}")

# Test /search endpoint
print("\nTesting /search endpoint...")
client = TestClient(app)
try:
    response = client.get(
        "/search",
        params={
            "origin": "WRO",
            "start": "2026-02-01",
            "end": "2026-02-28",
            "trip_length": 7,
            "top_n": 5,
            "providers": ["serpapi"]
        },
        headers={"X-Client-ID": "test-client-456"}
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 202:
        data = response.json()
        print(f"✅ Search created: {data.get('job_id', 'N/A')}")
    else:
        print(f"❌ Failed: {response.text[:200]}")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n✅ API tests completed!")
