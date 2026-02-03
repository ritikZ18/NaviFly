import requests
import time
import random
import json

import os

TELEMETRY_URL = os.getenv("TELEMETRY_URL", "http://localhost:8081/ingest")
ROUTING_URL = os.getenv("ROUTING_URL", "http://localhost:8080/route")

# Phoenix route nodes from main.go
ROUTE_POINTS = [
    {"id": "p1", "lat": 33.4484, "lon": -112.0740},
    {"id": "p2", "lat": 33.4500, "lon": -112.0800},
    {"id": "p3", "lat": 33.4600, "lon": -112.0700},
    {"id": "p4", "lat": 33.4400, "lon": -112.0600},
]

def simulate_drive(vehicle_id="Phx-01"):
    print(f"Starting simulation for {vehicle_id}...")
    
    # 1. Request route (Simulation of device getting route)
    # req_body = {"start_id": "p1", "end_id": "p3"}
    # ... In a real case we'd call routing-go ...

    # 2. Replay points
    for i in range(len(ROUTE_POINTS)):
        point = ROUTE_POINTS[i]
        
        # Add some jitter/noise
        lat = point["lat"] + random.uniform(-0.0001, 0.0001)
        lon = point["lon"] + random.uniform(-0.0001, 0.0001)
        
        payload = {
            "vehicle_id": vehicle_id,
            "lat": lat,
            "lon": lon,
            "speed": random.uniform(30, 65),
            "heading": random.uniform(0, 360),
            "timestamp": int(time.time())
        }
        
        try:
            resp = requests.post(TELEMETRY_URL, json=payload)
            if resp.status_code == 202:
                print(f"Sent: {vehicle_id} @ {lat:.5f}, {lon:.5f}")
            else:
                print(f"Failed to send telemetry: {resp.status_code}")
        except Exception as e:
            print(f"Error connecting to telemetry service: {e}")
        
        time.sleep(2)

if __name__ == "__main__":
    simulate_drive()
