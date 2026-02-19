# API Reference 📡

NaviFly uses RESTful APIs across all Go microservices. All services support CORS for direct UI interaction.

## 🛣️ Routing Service (`:8080`)

### `GET /locations`
Returns a list of all pre-defined nodes in the Arizona road network.
- **Purpose**: Populate UI dropdowns.

### `GET /osrm-route?start={id}&end={id}`
Retrieves real road geometry with traffic segmentation. 
- **Mechanism**: Checks **PostgreSQL Cache** first.
- **Failover**: On cache miss, it fetches real geometry from the OSRM demo server and persists it for future use.
- **Response**: `EnhancedResponse` JSON with traffic-colored segments.

### `GET /route?start={id}&end={id}`
Legacy alias for `/osrm-route`. Both endpoints now serve the same high-fidelity cached data.

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
