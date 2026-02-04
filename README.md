# NaviFly 
> High-Fidelity Fleet Command & Navigation Platform

NaviFly is a robust, microservices-oriented distributed system designed for real-time vehicle orchestration, telemetry ingestion, and cinematic navigation visualization. Built with a focus on high-fidelity performance and offline-first reliability.

##  System Overview
NaviFly consists of 5 core components orchestrated via Docker:
- **React Headunit (UI)**: A premium glassmorphism dashboard for real-time map visualization and control.
- **Routing Service (Go)**: High-speed A* pathfinding and OSRM proxying.
- **Telemetry Service (Go)**: High-throughput ingestion of real-time vehicle states.
- **Geo-Fence Service (Go)**: Spatial analytics and fence-checking.
- **Simulator (Python)**: Dynamic synthetic data generator for testing fleet scenarios.

##  Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js (for local UI development)
- Python 3.10+ (for analytics)

### Bootstrapping the Platform
Run the unified start script to build and launch all services:
```bash
./start.sh
```

Once complete, the platform is available at:
- **Dashboard**: [http://localhost:5173](http://localhost:5173)
- **API Registry**: [http://localhost:8080](http://localhost:8080)

##  Documentation
- [Architecture & Design](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Simulation Guide](analytics/python/README.md)

##  Tech Stack
- **Frontend**: React 18, TypeScript, MapLibre GL, Vite, Lucide Icons.
- **Backend**: Go (Golang), Gorilla Mux (High concurrency).
- **Data**: Redis (Real-time caching & state).
- **Automation**: GitHub Actions (CI/CD), Docker Compose.

## IMAGES : 
<img width="2184" height="1883" alt="Screenshot 2026-02-03 150059" src="https://github.com/user-attachments/assets/00642798-4bb6-45b9-96ac-5ae2fdec729b" />
<img width="2184" height="1883" alt="Screenshot 2026-02-03 150042" src="https://github.com/user-attachments/assets/3597069e-a88d-4893-b00d-012f27f11b96" />
<img width="2184" height="1883" alt="Screenshot 2026-02-03 150049" src="https://github.com/user-attachments/assets/f93d706e-34b2-4b94-b3c8-2b9cb5051364" />

