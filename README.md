# NaviFly 
> High-Fidelity Fleet Command & Navigation Platform

NaviFly is a robust, microservices-oriented distributed system designed for real-time vehicle orchestration, telemetry ingestion, and cinematic navigation visualization. Built with a focus on high-fidelity performance and offline-first reliability.

## 🏗️ System Overview
NaviFly consists of 5 core components orchestrated via Docker:
- **React Headunit (UI)**: A premium glassmorphism dashboard for real-time map visualization and control.
- **Routing Service (Go)**: High-speed route retrieval with **Persistent RDBMS Caching**.
- **PostgreSQL (DB)**: Persistent storage for 600+ pre-calculated Arizona route pairs (JSONB).
- **Telemetry Service (Go)**: High-throughput ingestion of real-time vehicle states.
- **Redis**: Real-time state store for active vehicle telemetry.
- **Simulator (Python)**: Dynamic synthetic data generator for testing fleet scenarios.

## 🏁 The "Realistic Maps" Fix
Previously, navigation used straight-line interpolations. We implemented a **Persistent Route Cache** mechanism:
1. **Real Geometry**: Routes now fetch actual road coordinates (I-10, I-17, etc.) from the OSRM engine.
2. **PostgreSQL Persistence**: All 600+ city pairs in Arizona are pre-calculated and stored as `JSONB` blobs.
3. **Sub-millisecond Retrieval**: Every navigation request is now a DB lookup, ensuring instant, offline-capable route loading with real road geometry.

## 🚀 Quick Start
##  Quick Start

### Prerequisites
- Docker & Docker Compose
- Map data in `data/` (optional, as caching is pre-populated from demo servers)

### Bootstrapping the Platform
Run the unified start script:
```bash
./start.sh
```
*Note: On first run, the Routing Service will automatically start populating the PostgreSQL cache with real road data (600 routes). This takes ~10 minutes but stays persistent forever.*

Once complete, the platform is available at:
- **Dashboard**: [http://localhost:5173](http://localhost:5173)

##  Documentation
- [Architecture & Design](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)

## 🛠️ Tech Stack
- **Frontend**: React 18, TypeScript, MapLibre GL, Vite.
- **Backend**: Go (Golang), GORM (RDBMS Management).
- **Data**: PostgreSQL (Route Persistence), Redis (Telemetry State).
##  Tech Stack
- **Frontend**: React 18, TypeScript, MapLibre GL, Vite, Lucide Icons.
- **Backend**: Go (Golang), Gorilla Mux (High concurrency).
- **Data**: Redis (Real-time caching & state).
- **Automation**: GitHub Actions (CI/CD), Docker Compose.

## IMAGES : 
<img width="2184" height="1883" alt="Screenshot 2026-02-03 150059" src="https://github.com/user-attachments/assets/00642798-4bb6-45b9-96ac-5ae2fdec729b" />
<img width="2184" height="1883" alt="Screenshot 2026-02-03 150042" src="https://github.com/user-attachments/assets/3597069e-a88d-4893-b00d-012f27f11b96" />
<img width="2184" height="1883" alt="Screenshot 2026-02-03 150049" src="https://github.com/user-attachments/assets/f93d706e-34b2-4b94-b3c8-2b9cb5051364" />

