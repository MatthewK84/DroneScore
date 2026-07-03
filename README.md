# Drone Smoke

C-sUAS interceptor evaluation app. Authorized users log air-to-air
engagements live from a phone or laptop. At end of day, an admin closes
the day and the app generates a Warfighter Observation Report (WOR) as a
vector PDF covering results, weather, sun times, location, and scorer notes.

## What changed in 2.0

- Live data entry replaces static seed files. Users add target drones and
  interceptors during the event, then score each engagement.
- Two-password access. A scorer password grants logging; an admin password
  grants editing, day closeout, and report management.
- Server-side reports. The WOR is built on the server as a resolution
  independent vector PDF and stored in Postgres, one report per closeout.
- Automated weather. Each engagement captures a National Weather Service
  observation for the range coordinates. No API key needed.

## Roles

| Action | Scorer | Admin |
|---|---|---|
| Log engagements, add drones and interceptors | Yes | Yes |
| Add schedule events, submit feedback | Yes | Yes |
| Edit or delete any record | No | Yes |
| Set day location, coordinates, weather note | No | Yes |
| Close the day and generate the WOR | No | Yes |
| Download, email, or reopen reports | Download only | Yes |

## Tabs

- **Score** Scoreboard for today, engagement form with a built-in
  stopwatch, and the day's log.
- **Fleet** Add and view target drones and interceptor platforms.
- **Day** Day settings, the "Done for the Day" closeout, and past reports.
- **Schedule** Event agenda stored in the database.
- **Feedback** Submit feedback; admins see full entries.

## Public conditions view

Outside personnel do not need a password. The sign-in screen has a "View
current flying conditions" link that opens a public, read-only page showing
the range weather and a GO / CAUTION / NO-GO estimate for each UAS group.
It exposes no scores, engagements, drone names, or notes.

The same weather and estimate appear live on the scorer and admin Score tab,
refreshing every five minutes, so everyone sees the same conditions. The
estimate is served by `GET /api/public/conditions`, the one unauthenticated
endpoint; every other route still requires a session.

Ratings come from wind, visibility, temperature, and sky conditions, with
tighter wind limits for smaller groups. Thresholds live in
`server/conditions.js` and are conservative range-safety heuristics, not
regulatory limits. The public page shows the range name from the current
day; set `DEFAULT_LOCATION_NAME`, or the day location, to a generic label if
you would rather not name the site publicly.

## Local setup

```bash
npm install
cp .env.example .env   # fill in passwords and SESSION_SECRET
```

Run a local Postgres and point `DATABASE_URL` at it, then start both
processes:

```bash
# Terminal 1 - Vite dev server on 3000, proxies /api to 3001
npm run dev

# Terminal 2 - API and report server on 3001
PORT=3001 node server/index.js
```

Open `http://localhost:3000`.

## Deploy to Railway

1. Push this repository to GitHub.
2. In Railway, choose **New Project** then **Deploy from GitHub repo** and
   select it. Railway detects Node and runs `npm run build` then
   `npm run start`.
3. Add a database: **New** then **Database** then **Add PostgreSQL**.
   Railway sets `DATABASE_URL` on the app automatically.
4. Under the service **Variables**, set the values below.
5. Redeploy. Railway provides a public URL. The Express process serves both
   the API and the built frontend, so no separate frontend service is needed.

### Required variables

| Variable | Value |
|---|---|
| `SCORER_PASSWORD` | Shared password for scorers |
| `ADMIN_PASSWORD` | Shared password for admins |
| `SESSION_SECRET` | 32+ random characters for cookie signing |

### Recommended variables

| Variable | Value |
|---|---|
| `DATABASE_SSL` | `false` for Railway's private connection |
| `DEFAULT_LOCATION_NAME` | Range name shown on new days |
| `DEFAULT_LATITUDE` | Range latitude, drives weather and sun times |
| `DEFAULT_LONGITUDE` | Range longitude |
| `APP_TIMEZONE` | IANA zone, for example `America/New_York` |
| `WOR_CLASSIFICATION` | Banner text, for example `UNCLASSIFIED//FOUO` |
| `NWS_USER_AGENT` | Identifies the app to the weather service |

### Optional email

Set `SENDGRID_API_KEY`, `FROM_ADDRESS`, and `RECIPIENT_1..4` to enable the
Email button on reports. Without them the app runs normally and reports stay
downloadable in the Day tab. `FROM_ADDRESS` must be a verified SendGrid
sender.

`PORT` and `DATABASE_URL` are injected by Railway. Do not set them manually.

## Architecture

```
Browser (React SPA, Vite build)
  └── /api/*  ->  Express (server/)
                    ├── auth        signed cookie sessions, two roles
                    ├── catalog     drones and interceptors
                    ├── operations  days, engagements, WOR PDF
                    └── support     schedule and feedback
                  Postgres          all records plus stored report PDFs
                  weather.js        National Weather Service client
                  wor.js            pdfmake vector report builder
```

The database schema is created on boot; no migration step is required.

## Data notes

- Probability of kill (Pk) counts successful intercepts against attempted
  intercepts. Runs marked "No Attempt" are excluded from the denominator.
- Weather is captured per engagement and summarized in the report. If the
  weather service is briefly unreachable, scoring still proceeds and the
  report notes that automated observations were unavailable.
- Closing a day locks scoring and writes a numbered report
  (`WOR-YYYYMMDD-NN`). An admin can reopen a day; the next closeout writes
  the next sequence number.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with API proxy |
| `npm run build` | Build the frontend to `dist/` |
| `npm run start` | Run the API and report server |
| `npm run lint` | ESLint across server and client |
