import pytest
import requests_mock
import time
from unittest.mock import patch
from simulator import simulate_drive, ROUTE_POINTS, TELEMETRY_URL


# ─── Original Tests ───

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


# ─── Extended Tests ───

def test_payload_speed_range():
    """Speed values should be in the expected 30–65 km/h range (with small jitter)."""
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, status_code=202)
        with patch('time.sleep', return_value=None):
            simulate_drive("Speed-Test-Vehicle")

        for req in m.request_history:
            payload = req.json()
            speed = payload["speed"]
            assert 25 <= speed <= 70, f"Speed {speed} out of expected range"


def test_payload_heading_range():
    """Heading should be between 0 and 360 degrees."""
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, status_code=202)
        with patch('time.sleep', return_value=None):
            simulate_drive("Heading-Test-Vehicle")

        for req in m.request_history:
            payload = req.json()
            heading = payload["heading"]
            assert 0 <= heading <= 360, f"Heading {heading} out of expected range"


def test_payload_coordinates_within_arizona():
    """Lat/lon values should be close to Arizona (~33°N, ~112°W)."""
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, status_code=202)
        with patch('time.sleep', return_value=None):
            simulate_drive("Coord-Test-Vehicle")

        for req in m.request_history:
            payload = req.json()
            lat = payload["lat"]
            lon = payload["lon"]
            # Arizona is roughly [31, 37] lat, [-115, -109] lon
            assert 30.9 <= lat <= 37.1, f"lat {lat} outside Arizona bounds"
            assert -115.1 <= lon <= -108.9, f"lon {lon} outside Arizona bounds"


def test_payload_timestamp_is_recent():
    """Timestamps should be unix epoch near current time."""
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, status_code=202)
        with patch('time.sleep', return_value=None):
            simulate_drive("Time-Test-Vehicle")

        now = int(time.time())
        for req in m.request_history:
            payload = req.json()
            ts = payload["timestamp"]
            # Allow 5 seconds of slack
            assert abs(ts - now) <= 5, f"Timestamp {ts} too far from now ({now})"


def test_multi_vehicle_independence():
    """Two different vehicles should produce separate, independent requests."""
    with requests_mock.Mocker() as m:
        m.post(TELEMETRY_URL, status_code=202)

        with patch('time.sleep', return_value=None):
            simulate_drive("Alpha-01")

        alpha_count = m.call_count

        with patch('time.sleep', return_value=None):
            simulate_drive("Bravo-02")

        bravo_calls = m.request_history[alpha_count:]
        for req in bravo_calls:
            payload = req.json()
            assert payload["vehicle_id"] == "Bravo-02"

        assert m.call_count == len(ROUTE_POINTS) * 2


def test_route_points_not_empty():
    """ROUTE_POINTS must contain at least 2 points for a valid simulation."""
    assert len(ROUTE_POINTS) >= 2, "Need at least 2 route points for a meaningful simulation"


def test_route_points_have_required_fields():
    """Each route point must have id, lat, lon."""
    for point in ROUTE_POINTS:
        assert "id" in point
        assert "lat" in point
        assert "lon" in point
        assert isinstance(point["lat"], float)
        assert isinstance(point["lon"], float)
