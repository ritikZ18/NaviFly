import pytest
import requests_mock
import json
from unittest.mock import patch
from simulator import simulate_drive, ROUTE_POINTS, TELEMETRY_URL

def test_simulate_drive_success():
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, status_code=202)
        
        # Mock sleep to make tests instant
        with patch('time.sleep', return_value=None):
            simulate_drive("Test-Vehicle")
            
        # Verify all points were sent
        assert m.call_count == len(ROUTE_POINTS)
        
        # Verify the first payload structure
        last_request = m.request_history[0]
        payload = last_request.json()
        assert payload["vehicle_id"] == "Test-Vehicle"
        assert "lat" in payload
        assert "lon" in payload
        assert "speed" in payload
        assert "timestamp" in payload

def test_simulate_drive_failure():
    with requests_mock.Mocker() as m:
        # Simulate service down
        m.post(TELEMETRY_URL, status_code=500)
        
        with patch('time.sleep', return_value=None):
            # This shouldn't raise exception, just print error
            simulate_drive("Test-Vehicle")
            
        assert m.call_count == len(ROUTE_POINTS)

def test_simulate_drive_connection_error():
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, exc=Exception("Connection refused"))
        
        with patch('time.sleep', return_value=None):
            simulate_drive("Test-Vehicle")
            
        assert m.call_count == len(ROUTE_POINTS)
