# Arts Access Miami 🎨🗺️

> An interactive map of **arts-education access across Miami-Dade County public schools** — built for Young Musicians Unite (YMU) / Arts Access Miami.

The map answers one question for funders, staff, and district partners: **where do the arts reach students, and where are the gaps?**

It presents two lenses over a single dataset:

- **Schools** — every school is a dot, **colored by arts-access level** and **sized by enrollment**.
- **Partners** — every arts organization is placed at the **centroid of the schools it serves**, with **reach lines** drawn to each school — the "who serves whom" web.

---

## ✨ Features

| Feature | What it does |
|---|---|
| **Schools ⇆ Partners toggle** | Two views of the same data — school access vs. organization reach |
| **Highlight access gaps** | Dims well-served schools and spotlights the schools with limited/no arts programming |
| **Partner reach lines** | Selecting an org draws lines to every school it serves and **isolates it** (hides other partners) |
| **Click-to-detail panel** | A school shows its arts partners + impact; a partner shows every school it serves |
| **School photo flyout** | An openable/closable photo panel beside the school detail (placeholder image → real photo via Airtable) |
| **Map / Satellite basemap** | Toggle CARTO Voyager ↔ Esri satellite; reach lines + county outline **recolor for contrast** on imagery |
| **Miami-Dade County boundary** | A dashed county outline + faint fill frames the tracked area |
| **Clustering** | Schools cluster when zoomed out, individual pins at county zoom |
| **Legend, scale bar, distance scale** | Lens-aware color index + a bottom-left distance scale |
| **Mobile-first** | Full-screen map with an on-demand, **swipeable bottom sheet** (swipe up = expand, down = collapse, down again = hide) |
| **Single-origin** | UI + API served from one URL — shareable via a tunnel / VSCode dev tunnel / LAN with no extra config |

---

## 🏗️ Architecture

```
┌─────────────────────────────┐
│  Browser (React + MapLibre) │
│  ArtsAccessMap.tsx          │
└──────────────┬──────────────┘
               │  /schools*  /partners*   (same origin)
               ▼
┌─────────────────────────────┐     proxy      ┌──────────────────────────┐
│  Vite dev server (:5173)    │ ─────────────► │  routing-go (Go, :8080)  │
│  proxies API → routing-go   │                │  GORM · gorilla/mux      │
└─────────────────────────────┘                └────────────┬─────────────┘
                                                             │ GORM
                                                       ┌─────▼──────┐
                                                       │ PostgreSQL │
                                                       │ schools /  │
                                                       │ programs   │
                                                       └────────────┘
```

### The data-privacy design (the important bit)

The map is **light by construction, not by optimization**:

- **Heavy, private data** (per-student survey rows) stays in Postgres and is never shipped to the browser.
- The **public map only loads precomputed aggregates** — a tiny GeoJSON of ~32 school points with summary fields (access level, enrollment, program count). Tens of KB, cached.
- **Full detail is fetched one item at a time**, only on click (`/schools/{id}`, `/partners/{id}`).

This keeps student data (minors') off the client and the map fast regardless of dataset size.

---

## 🧩 Data model

Two tables; **partners are not a third table** — they're a `GROUP BY organization` over the program rows.

```
School   (id, name, address, lat, lng, region, students, access_level, image_url)
Program  (id, school_id → School, organization, discipline, students, participation, impact)
```

- `access_level` (`high` / `medium` / `low` / `none`) is **precomputed on write** from a school's programs — the map never calculates it.
- A **Partner** = one organization, placed at the **centroid** of the schools it serves, sized by school reach, colored by its primary discipline.

---

## 🔌 API

Served by `routing-go`, and available under the same origin as the UI (via the Vite proxy).

| Endpoint | Returns |
|---|---|
| `GET /schools.geojson` | Light FeatureCollection — one point per school (summary fields only). Cached. |
| `GET /schools/summary` | County rollup: counts by access level & region, totals, gap count. |
| `GET /schools/{id}` | Full school detail incl. all programs + impact + `image_url`. |
| `GET /partners.geojson` | One point per organization (centroid, school_count, students, primary discipline, reach level). Cached. |
| `GET /partners/{id}` | An org with the full list of schools it serves. |

---

## 🚀 Running locally

**Prerequisite:** Docker + Docker Compose.

Bring up the three services the app needs (Postgres, Go API, UI):

```bash
docker compose up -d --build db routing-service ui
```

| Service | URL |
|---|---|
| **App (UI)** | http://localhost:5173 |
| API (proxied under the UI too) | http://localhost:8080 |

On startup the API **migrates and seeds** illustrative Miami-Dade sample data (**32 schools · 10 partner orgs · 49 programs · ~63,750 students · 15 gaps**). Sample data auto-refreshes on every restart, so seed edits take effect immediately.

> The legacy OSRM route pre-calculation (from this repo's NaviFly heritage) is **off by default**. Set `ENABLE_ROUTE_PRECALC=true` on `routing-service` only if you want it.

To stop:

```bash
docker compose down          # keep data volume
docker compose down -v       # also wipe the Postgres volume
```

---

## 📱 Sharing to another device (phone / demo)

The app is **single-origin**: the Vite dev server proxies `/schools` and `/partners` to the Go API, so exposing **only port 5173** gives you the whole app. Vite is configured with `allowedHosts: true` so tunnel/forwarded hostnames are accepted.

- **VSCode Dev Tunnel** — forward port `5173`, set it Public, open the URL on any device.
- **Cloudflare quick tunnel** — `cloudflared tunnel --url http://localhost:5173`.
- **Same Wi-Fi** — open `http://<your-LAN-IP>:5173` on the phone.

No API URL configuration needed on the other device.

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, **MapLibre GL**, Vite 7 |
| Basemaps | CARTO Voyager (light) · Esri World Imagery (satellite) |
| Backend | Go, gorilla/mux, GORM |
| Database | PostgreSQL 16 |
| Infra | Docker Compose |
| Fonts | Roboto |

---

## 📁 Project structure

```
artlook-ymu/
├── ui/react-headunit/
│   └── src/
│       ├── App.tsx                     # renders ArtsAccessMap
│       ├── artlook.css                 # light "South Beach" theme
│       └── components/
│           └── ArtsAccessMap.tsx       # the whole map app (both lenses)
├── services/routing-go/
│   ├── main.go                         # server + DB bootstrap
│   ├── schools.go                      # School/Program models, seed, /schools endpoints
│   └── partners.go                     # GROUP BY-org aggregation, /partners endpoints
├── docker-compose.yaml
└── README.md
```

> This repository was adapted from **NaviFly** (a MapLibre + Go fleet-navigation project). The other services under `services/` and `analytics/` are NaviFly heritage and are not used by the Arts Access app.

---

## 🗺️ Roadmap

- **Airtable sync** — replace the seeded sample data with live data pulled from an Airtable base (schools + programs), including **geocoded addresses** so pins snap to real buildings. Same pipeline shape: intake → validate/normalize (AI-assisted) → Postgres → precompute → tiny public GeoJSON.
- Fly-to-school from a partner's "Schools served" list.
- Real school photography in the photo flyout (driven by `image_url`).

---

*All figures in the app are labeled **illustrative sample data** — invented numbers that demonstrate the concept until real survey data is connected.*
