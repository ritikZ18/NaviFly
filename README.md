# NaviFly 🛩️
> High-Fidelity Fleet Command & Navigation Platform

NaviFly is a production-grade, microservices-oriented distributed system for real-time vehicle orchestration, live traffic intelligence, and cinematic navigation visualization — built for a head-unit experience.

---

## ✨ Feature Highlights

### 🗺️ Map & Visualization
| Feature | Description |
|---|---|
| **Smart Routing** | Multi-waypoint A* routing with 3 alternate route options, color-coded by ETA |
| **Globe View** 🌍 | Full 3D spherical Earth projection with auto-rotating animation |
| **3D Terrain** ⛰️ | Real digital elevation model (DEM) — Arizona mountains rendered in 3D at 45° pitch |
| **Satellite Tiles** 🛰️ | Toggle between street map and Esri satellite imagery |
| **Traffic Flow** 🚦 | Live TomTom traffic tiles — green/amber/red road congestion on every street |
| **Traffic Incidents** | Real accident, closure, and roadwork markers with clickable delay popups |
| **Live Aircraft** ✈️ | OpenSky Network real aircraft over Arizona, refreshed every 10s |
| **Aircraft Tracking** | Lock camera to any aircraft by ICAO24 ID |
| **Simulated Cars** 🚗 | 27 animated cars across 7 AZ highways (fallback when no TomTom key) |

### 🧭 Navigation
| Feature | Description |
|---|---|
| **Turn-by-Turn Routing** | Real OSRM road geometry via PostgreSQL route cache |
| **Vehicle Simulation** | Smooth movement along road coordinates with configurable speed multiplier |
| **Multi-Vehicle Modes** | Car, Truck, Motorcycle, Drone — each with unique avatar and speed profile |
| **Scope / Cinematic Cam** | Birds-eye follow mode with adjustable zoom |
| **Waypoints** | Up to 5 intermediate stops with drag-to-reorder |
| **Break Planner** | Automatic rest stop recommendations on long routes |
| **Dynamic Re-routing** | Re-routes on deviation from planned path |
| **Offline Maps** | Tile caching for offline map support |

---

## 🏗️ System Architecture

```
┌─────────────────────┐    HTTP     ┌──────────────────────┐
│  React Headunit UI  │──────────→ │  Routing Service (Go) │
│  (MapLibre GL)      │            │  Port 8080           │
└─────────────────────┘            └───────────┬──────────┘
         │                                     │ GORM
         │ WebSocket                     ┌─────▼──────┐
         ▼                               │ PostgreSQL  │
┌─────────────────────┐                 │ 600+ routes │
│ Telemetry Svc (Go)  │                 └────────────┘
│   Port 8081         │
└─────────┬───────────┘
          │ Redis client
    ┌─────▼──────┐     publishes    ┌───────────────────┐
    │   Redis    │ ←─────────────── │ Simulator (Python) │
    └────────────┘                  │ Fleet data gen     │
                                    └───────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose

### Run
```bash
./start.sh
```

On first run the routing service populates the PostgreSQL cache with ~600 pre-calculated Arizona route pairs (OSRM geometry). This runs once and persists across restarts.

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| Routing API | http://localhost:8080 |
| Telemetry API | http://localhost:8081 |

### Stop
```bash
./start.sh --stop
```

---

## 🔑 Live Traffic API Setup (Optional)

NaviFly integrates with **TomTom's Traffic API** for real live traffic data (same source as Google Maps).

1. Sign up for free at [developer.tomtom.com](https://developer.tomtom.com/user/register) — no credit card
2. Create an app and copy your API key
3. Add to `ui/react-headunit/.env`:

```env
VITE_TOMTOM_API_KEY=your_key_here
```

4. Restart with `./start.sh --stop && ./start.sh`

**Free tier:** 2,500 tile requests/day — plenty for development and demos.

> Without a key, the traffic toggle shows 27 simulated animated cars and OpenSky aircraft as a visual fallback.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, MapLibre GL, Vite |
| Routing Backend | Go, Gorilla Mux, GORM, OSRM |
| Telemetry Backend | Go, Gorilla Mux, Redis |
| Map Matching | Go |
| Database | PostgreSQL (route cache, JSONB) |
| Cache | Redis (live telemetry state) |
| Simulator | Python, Flask, requests |
| Infra | Docker Compose |
| Traffic | TomTom Traffic API (live) + OpenSky Network (aircraft) |
| CI | GitHub Actions |

---

## 🧪 Testing

All three service layers have automated test coverage:

| Layer | Framework | Tests |
|---|---|---|
| routing-go | Go Test + Testify | 11 |
| mapmatch-go | Go Test + Testify | 6 |
| telemetry-go | Go Test + Testify + miniredis | 3 |
| React (RouteContext) | Vitest + Testing Library | 11 |
| React (SearchableLocationInput) | Vitest + Testing Library | 6 |
| Python simulator | Pytest + requests-mock | 10 |

### Run Tests

**Go services:**
```bash
cd services/routing-go && go test ./... -v
cd services/mapmatch-go && go test ./... -v
cd services/telemetry-go && go test ./... -v
```

**React UI:**
```bash
cd ui/react-headunit && npm test
```

**Python:**
```bash
cd analytics/python && pytest -v
```

---

## 📁 Project Structure

```
NaviFly/
├── ui/react-headunit/         # React dashboard (MapLibre GL)
│   ├── src/components/        # Map, NavigationPanel, RouteLoader...
│   ├── src/context/           # RouteContext (global state)
│   └── .env                   # VITE_TOMTOM_API_KEY (you add this)
├── services/
│   ├── routing-go/            # Route calculation + PostgreSQL cache
│   ├── telemetry-go/          # Vehicle telemetry ingestion
│   └── mapmatch-go/           # GPS map-matching
├── analytics/python/          # Fleet simulator + Pytest tests
├── data/                      # Arizona road graph data
├── docker-compose.yml
└── start.sh                   # One-command deploy & teardown
```

---

## 📸 Screenshots

<img width="2184" alt="NaviFly Dashboard" src="https://github.com/user-attachments/assets/00642798-4bb6-45b9-96ac-5ae2fdec729b" />
<img width="2184" alt="Route Planning" src="https://github.com/user-attachments/assets/3597069e-a88d-4893-b00d-012f27f11b96" />
<img width="2184" alt="Navigation Mode" src="https://github.com/user-attachments/assets/f93d706e-34b2-4b94-b3c8-2b9cb5051364" />
