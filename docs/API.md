# API Reference 📡

NaviFly uses RESTful APIs across all Go microservices. All services support CORS for direct UI interaction.

## 🛣️ Routing Service (`:8080`)

### `GET /locations`
Returns a list of all pre-defined nodes in the Arizona road network.
- **Purpose**: Populate UI dropdowns.

### `GET /route?start={id}&end={id}`
Calculates an interpolated path between two node IDs.
- **Output**: JSON with `road_geometry` (Arrays of [lat, lon]).

### `GET /osrm-route?start={id}&end={id}`
Proxies a request to the Project OSRM API for real road geometry.
- **Failover**: Fails within 2s to local routing if OSRM is slow.

---

## 🛰️ Telemetry Service (`:8081`)

### `POST /ingest`
Ingests real-time vehicle movement data.
**Payload:**
```json
{
  "vehicle_id": "car-001",
  "lat": 33.4484,
  "lon": -112.0740,
  "speed": 65.0,
  "heading": 90.0
}
```

### `GET /vehicle/{id}`
Returns the latest known state of a specific vehicle from Redis.

---

## 🗺️ MapMatch Service (`:8082`)

### `POST /geofence/check`
Checks if a given coordinate is inside any defined geofences.
**Payload:**
```json
{
  "lat": 33.45,
  "lon": -112.07
}
```
**Response:**
```json
{
  "geofences": ["Downtown-Zone-1"],
  "is_inside": true
}
```

---

## 🏥 Health Checks
Each service implements a `GET /health` endpoint for Docker/Kubernetes health monitoring.
