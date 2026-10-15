# Weather-Aware Truck Routing

A React + Django web app that helps a truck driver choose the safest of several routes. It weighs the forecast weather each route will meet at the truck's estimated arrival times, the cargo weight, and travel time.

|                   |                                                     |
| ----------------- | --------------------------------------------------- |
| Live application  | https://weather-aware-truck-routing-nine.vercel.app |
| Walkthrough video | _TODO: added once recorded_                         |

## Local development

### Prerequisites

- Python 3.12
- Node.js 22.12 or newer
- A free [TomTom developer](https://developer.tomtom.com/) API key for routing and geocoding

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
make check            # lint, format, types, tests and build, for both apps
make e2e              # browser journeys against mocked services
```

|                  | Backend (`backend/`)              | Frontend (`frontend/`) |
| ---------------- | --------------------------------- | ---------------------- |
| Lint             | `.venv/bin/ruff check .`          | `npm run lint`         |
| Format           | `.venv/bin/ruff format --check .` | `npm run format:check` |
| Types            | `.venv/bin/mypy .`                | `npm run typecheck`    |
| Tests            | `.venv/bin/python -m pytest`      | `npm test`             |
| Browser journeys | n/a                               | `npm run test:e2e`     |
| Build            | n/a                               | `npm run build`        |

### What the tests cover

The backend has 365 tests at 100% branch coverage: every threshold below, at and above its edge, the load rules across every wind band, the ranking order and its tie-breaks, daylight-saving departures, and each provider failure path. The frontend has 298 unit and component tests, plus Playwright journeys that answer every request from generated fixtures, so the browser tests never use a provider's quota.

## What it does

1. The driver enters an origin, a destination, a departure day and time, a cargo weight in pounds, and how often to check the weather (every 10, 25 or 50 miles).
2. The app asks TomTom for up to three truck routes and places checkpoints along each one at the chosen interval, measured along the road rather than in a straight line.
3. For every checkpoint it works out when the truck arrives and takes the hourly forecast for that place and hour.
4. Each checkpoint is classified Low, Moderate, High, Severe or No Travel from wind gusts, rain and snow, with the cargo-weight rules applied to wind.
5. The routes are ranked and one is recommended, with an explanation of what decided it.
6. A map shows every route, its checkpoints, their risk levels and arrival times, and a weather heatmap along the corridor with a slider covering the next 48 hours.

## How the risk is decided

### Thresholds

| Condition | Low          | Moderate  | High      | Severe    | No Travel |
| --------- | ------------ | --------- | --------- | --------- | --------- |
| Wind      | < 25 mph     | 25–34     | 35–44     | 45–54     | ≥ 55 mph  |
| Rain      | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00    |
| Snow      | < 0.5 in/hr  | 0.5–1.0   | 1.0–2.0   | 2.0–3.0   | > 3.0     |

Load rules, applied to the wind level:

- ≥ 55 mph is No Travel for any load;
- 45–54 mph above 30,000 lb is No Travel;
- 35–44 mph above 40,000 lb is Severe.

A checkpoint's level is the most severe of its wind, rain and snow levels.

### Decisions behind those rules

- **Wind is read from the hourly maximum gust**, not the sustained speed. Gusts are never lower than the sustained speed, so this is the cautious reading of the brief's single "Wind" row, and gusts are what move a high-sided trailer.
- **A shared band edge belongs to the higher band.** The brief's bands touch at their edges: 25–34 and 35–44 both name 35 in ordinary speech. Exactly 35 mph is therefore High, exactly 45 is Severe, and exactly 0.10 in/hr is Moderate. The No Travel rows for rain and snow are written as "> 1.00" and "> 3.0", so exactly 1.00 in/hr stays Severe.
- **The load rules use a strict "above".** Exactly 30,000 lb in a 45–54 mph wind is not raised to No Travel; 30,001 lb is.
- **Rain is rain plus showers**, which the forecast reports separately. Snow is snowfall in inches per hour.
- **A missing reading never lowers a level.** When part of an hour's forecast is missing, the level is a lower bound: a checkpoint shows the worst level its known readings justify, and the recommendation is marked provisional. Nothing is substituted with current weather.
- **Routes are always planned for an 80,000 lb truck**, the US federal maximum, so a route is legal for any load. The cargo weight the driver enters feeds the load rules only, which is why changing it re-assesses the same routes instead of fetching new ones.

### Which forecast hour applies

Forecast records describe the hour that ends at their timestamp: precipitation is the total for the preceding hour and gusts are that hour's maximum. For any moment, the app uses the record covering the hour that moment falls in. A truck arriving at 14:20 is assessed against the 14:00–15:00 record, and so is one arriving at 14:00 exactly. The same rule drives the checkpoints, the heatmap frames and the truck markers, so nothing on screen can disagree with anything else.

### How routes are ranked

In order:

1. routes with no forecast data at all;
2. routes with any No Travel checkpoint;
3. routes with any checkpoint whose forecast is missing;
4. fewest No Travel miles;
5. fewest Severe miles;
6. fewest High miles;
7. lowest average risk;
8. shortest travel time;
9. the provider's own order.

The brief's four preferences are steps 4 to 8. Steps 1 to 3 come first on purpose: a route that cannot be assessed, or that crosses conditions the rules call No Travel, should not be recommended because it happens to be short. This does mean a route with an unforecast stretch can rank behind one with Severe miles. The recommendation says so when it happens, and no route is ever called safe when it is not.

Comparisons use the figures shown on screen, so every explanation can be checked against the numbers beside it. Each checkpoint stands for the stretch of road halfway to each of its neighbours, which is how the mile totals are produced; a stretch under a mile is shown as "< 1" rather than rounded away.

### Other things worth knowing

- **Arrival times assume continuous driving.** Required rest breaks are not modelled, so a long trip's later checkpoints are optimistic. The app says this beside the recommendation.
- **Fewer than three routes** is possible when the provider finds only one or two genuinely different ones. The app shows what it found and says so.
- **The closest match for a place is filled in**, and the other matches are offered as one-click alternatives, so a wrong guess is easy to correct.

## Architecture

```
browser ──1── POST /api/routes ──► Django ──► TomTom (routes, geocoding)
   │                                   └── returns routes, checkpoints,
   │                                       the corridor grid, a signed plan
   │                                       token and a prepared forecast request
   ├──2── POST the prepared request ──► Open-Meteo
   │
   └──3── POST /api/assess ─────────► Django (validates the relayed forecast,
                                       applies the rules, ranks the routes)
```

**The browser fetches the weather itself.** Open-Meteo's free tier is limited per IP address. If the server fetched forecasts, every user would share one quota and a handful of trips would exhaust it. Instead the backend prepares the exact request, the browser sends it, and the backend re-validates everything that comes back: the number of locations, the exact timestamps, the units, and that every value is finite and sensible. Relayed data is trusted only for the session that sent it, so a tampered response can only mislead the person who tampered with it.

**The plan travels in a signed token.** `/api/routes` returns a token holding the trip's geometry and checkpoints, signed by the server and valid for 30 minutes. `/api/assess` reads that instead of trusting the browser's copy, so there is no server-side session and the service stays stateless. An expired token makes the app plan the trip again.

### Endpoints

|                       |                                                                      |
| --------------------- | -------------------------------------------------------------------- |
| `GET /api/health`     | service check                                                        |
| `GET /api/geocode?q=` | places in the US and Canada                                          |
| `POST /api/routes`    | routes, checkpoints, corridor, plan token, prepared forecast request |
| `POST /api/assess`    | risk per checkpoint, route metrics, recommendation, heatmap frames   |

Every failure answers with the same shape — `{"error": {"code", "message", "fields"?}}` — using codes such as `NO_ROUTE`, `INTERVAL_TOO_FINE`, `TRIP_TOO_LARGE`, `PROVIDER_TIMEOUT` and `CONTEXT_EXPIRED`.

### Map and heatmap

The map is created once and never rebuilt; new plans replace its data in place. The heatmap's colours come from MapLibre feature state, so moving the forecast slider changes no source data and makes no network request — only the cells whose level actually changed are touched, and updates are limited to one per animation frame. Dragging the slider across 1,000 corridor cells and 49 hours holds a 95th-percentile frame time of 10 ms, or 19 ms with the processor throttled four times. MapLibre is loaded separately from the rest of the app, so the planning form appears before the map library has downloaded.

Colour on the map means risk and nothing else: routes are told apart by line pattern and a letter, and every risk level carries a road-sign shape and a text label as well as a colour.

## Limitations

- **United States and Canada only**, because truck routing and place search are limited to those countries here.
- **Departures up to seven days ahead.** The forecast horizon is fifteen days, and a plan needs the departure, the whole trip and the 48-hour slider to fit inside it.
- **One plan is capped at 1,000 forecast locations.** A trip needing more is refused with `INTERVAL_TOO_FINE` and a suggested coarser interval, or `TRIP_TOO_LARGE` when even 50-mile spacing will not fit. A single large plan can also exceed Open-Meteo's per-minute limit, in which case the app says the weather service is busy and to try again shortly.
- **Freezing rain, ice and visibility are not assessed.** The brief's rules cover wind, rain and snow, and the app does not invent rules beyond them.
- **Rate limiting is best effort.** It counts requests per server instance in memory, which on serverless hosting means several instances count separately.
- **Hourly forecasts and a 0.05° sampling lattice** mean two nearby checkpoints can share a forecast point, and a corridor cell can differ slightly from a checkpoint inside it.

## Deployment

The app runs as one Vercel project with two services behind a single domain: the Vite build serves everything, and `/api/*` is routed to the Django service. One origin means no CORS configuration.

Environment variables on the hosting project:

|                                                                           |                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `DJANGO_SECRET_KEY`                                                       | required; the app refuses to start without it when debug is off |
| `DJANGO_ALLOWED_HOSTS`                                                    | required; comma-separated hostnames                             |
| `TOMTOM_API_KEY`                                                          | required for routing and geocoding                              |
| `DJANGO_DEBUG`                                                            | `false` in production                                           |
| `API_THROTTLE_PLANS`, `API_THROTTLE_ASSESSMENTS`, `API_THROTTLE_GEOCODES` | optional rate limits, by default 20, 60 and 60 per minute       |

The TomTom key is used server-side only and never reaches the browser.

## Data attribution

- Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles by [OpenFreeMap](https://openfreemap.org/).
- Routing and geocoding by TomTom.
