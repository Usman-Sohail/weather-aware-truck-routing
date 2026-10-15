# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver choose the safest of several routes. It weighs the forecast weather each route will meet at the truck's estimated arrival times, the cargo weight, and travel time.

> **Status: in development.**

| | |
|---|---|
| Live application | _TODO: added once deployed and verified_ |
| Walkthrough video | _TODO: added once recorded_ |

## What it does

1. The driver enters an origin, a destination, a departure date and time, a cargo weight (lb), and a weather sampling interval (10, 25 or 50 miles).
2. The app requests up to three truck routes from TomTom and places checkpoints along each route at the chosen interval, measured along the route.
3. For every checkpoint it estimates the truck's arrival time and uses the hourly forecast for that place and hour.
4. Each checkpoint is classified Low, Moderate, High, Severe or No Travel from wind gusts, rain and snow, with the cargo-weight rules applied to wind.
5. Routes are ranked:
   - routes with No Travel conditions rank last;
   - then fewest Severe miles, fewest High miles, lowest average risk and shortest travel time.

   The recommendation explains which criterion decided it.
6. A map shows every route, checkpoint, risk level and ETA. A heatmap of the trip corridor has a 0–48 hour slider counted from departure.

## Technology

- **Frontend:** React, TypeScript, Vite, MapLibre GL JS, OpenFreeMap tiles
- **Backend:** Python 3.12, Django 5.2 LTS, Django REST Framework
- **Data providers:** TomTom (truck routing, geocoding), Open-Meteo (hourly forecasts)
- **Hosting:** Vercel

## Local development

### Prerequisites

- Python 3.12
- Node.js 22.12 or newer
- A free [TomTom developer](https://developer.tomtom.com/) API key, needed for routing and geocoding

### Setup

```bash
make setup            # backend virtual environment + frontend packages
```

Or step by step:

```bash
# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
cp .env.example .env  # then set TOMTOM_API_KEY (and a real DJANGO_SECRET_KEY)

# Frontend
cd ../frontend
npm ci
```

### Run

In two terminals:

```bash
make dev-backend      # Django API on http://127.0.0.1:8000
make dev-frontend     # app on http://127.0.0.1:5173 (proxies /api to the backend)
```

### Checks

```bash
make check            # everything below, for both apps
```

| | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Lint | `.venv/bin/ruff check .` | `npm run lint` |
| Format | `.venv/bin/ruff format --check .` | `npm run format:check` |
| Types | `.venv/bin/mypy .` | `npm run typecheck` |
| Tests | `.venv/bin/python -m pytest` | `npm test` |
| Build | n/a | `npm run build` |

## Data attribution

- Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles by [OpenFreeMap](https://openfreemap.org/).
- Routing and geocoding by TomTom.
