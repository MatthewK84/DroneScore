# Drone Smoke

C-sUAS interceptor evaluation app. Authorized users log air-to-air
engagements live from a phone or laptop. At end of day, an admin closes the
day and the app generates a Warfighter Observation Report (WOR) as a vector
PDF covering results, weather, sun times, location, and scorer notes.

## Access model: two links, one database

The app serves two audiences from one codebase and one database:

- **Ops console** for scorers and admins who enter data. Scorers log
  engagements; admins edit records and close the day.
- **Read-only board** for the general authorized population. Viewers see the
  same pages, updated live, with no way to edit anything.

You deploy the codebase as two Railway services that share one Postgres
database. A build-time flag, `VITE_APP_MODE`, decides which link a service
serves. Everyone signs in with a password; the password determines the role.

| | Ops console link | Read-only board link |
|---|---|---|
| `VITE_APP_MODE` | unset (defaults to `ops`) | `board` |
| Who gets it | Scorers and admins | General population |
| Password handed out | Scorer and admin | Viewer |
| Can edit data | Yes (scorer/admin) | No, read-only for everyone |

Access is enforced on the server, not just in the UI. The board build does
not even ship the data-entry components, and every write route rejects the
viewer role regardless of which link is used.

## Roles

| Action | Viewer | Scorer | Admin |
|---|---|---|---|
| See every page (read-only board) | Yes | Yes | Yes |
| Log engagements, add drones and interceptors | No | Yes | Yes |
| Add schedule events, submit feedback | No | Yes | Yes |
| Edit or delete any record | No | No | Yes |
| Set day location, coordinates, weather note | No | No | Yes |
| Close the day and generate the WOR | No | No | Yes |
| Download or email reports | Download | Download | Yes |

## Tabs

- **Conditions** (board) Range weather and a GO / CAUTION / NO-FLY estimate
  per UAS Group.
- **Score** Scoreboard for today, engagement form with a stopwatch, and the
  day's log.
- **Fleet** Target drones and interceptor platforms.
- **Day** Day settings, the "Done for the Day" closeout, and past reports.
- **Schedule** Event agenda stored in the database.
- **Feedback** Submit feedback; admins see full entries.

The Conditions weather panel also appears on the Score tab, so operators see
the same conditions as the board.

## Deploy on Railway (two links)

Goal: two HTTPS URLs from one repository and one database. Railway gives each
service its own free `*.up.railway.app` domain, so no custom DNS is required.

### Step 1. Push to GitHub

Push this repository to GitHub.

### Step 2. Create the project and the ops console service

1. In Railway, choose **New Project**, then **Deploy from GitHub repo**, and
   select the repository. This first service is your ops console.
2. Open **Settings** and rename the service to `dronesmoke-ops` for clarity.
3. Add the database: **New**, then **Database**, then **Add PostgreSQL**.
   Railway sets `DATABASE_URL` on the ops service automatically.
4. Open the ops service **Variables** and set the required values from the
   table below. Leave `VITE_APP_MODE` unset; it defaults to the ops console.
5. Open **Settings**, then **Networking**, then **Generate Domain**. This URL
   is your data-entry link. Hand it to scorers and admins.

### Step 3. Add the read-only board service

1. In the same project, choose **New**, then **GitHub Repo**, and select the
   same repository. This second service is your board.
2. Open **Settings** and rename it to `dronesmoke-board`. Leave **Root
   Directory** empty, the same as the ops service.
3. Open the board service **Variables** and set:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` as a reference variable, so
     the board reads the same database. Replace `Postgres` with your database
     service name if it differs.
   - `VITE_APP_MODE` = `board`. This is read at build time and makes the
     frontend read-only.
   - `VIEWER_PASSWORD`, plus `SCORER_PASSWORD`, `ADMIN_PASSWORD`, and
     `SESSION_SECRET`. The board UI only uses the viewer password, but the
     server validates all of them at boot; reuse the same values.
   - The same range variables (`DEFAULT_LATITUDE` and friends) so weather
     resolves identically to the ops console.
4. Open **Settings**, then **Networking**, then **Generate Domain**. This URL
   is your read-only link. Hand it to the general population.
5. Deploy. Because `VITE_APP_MODE` is set before the build runs, the board
   frontend builds as read-only.

### Step 4. Hand out the two links

- Ops console URL plus the scorer and admin passwords go to your scoring team.
- Board URL plus the viewer password goes to the general population.

Both services share one database, so the board tracks scoring and admin
changes, including the admin-set day location, in near real time.

### Required variables (both services)

| Variable | Value |
|---|---|
| `SCORER_PASSWORD` | Shared password for scorers |
| `ADMIN_PASSWORD` | Shared password for admins |
| `VIEWER_PASSWORD` | Shared password for the read-only board |
| `SESSION_SECRET` | 32+ random characters for cookie signing |

### Board service only

| Variable | Value |
|---|---|
| `VITE_APP_MODE` | `board` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the shared database) |

### Recommended variables (both services)

| Variable | Value |
|---|---|
| `DATABASE_SSL` | `false` for Railway's private connection |
| `DEFAULT_LOCATION_NAME` | Range name shown on new days |
| `DEFAULT_LATITUDE` | Range latitude, drives weather and sun times |
| `DEFAULT_LONGITUDE` | Range longitude |
| `APP_TIMEZONE` | IANA zone, for example `America/New_York` |
| `WOR_CLASSIFICATION` | Banner text, for example `UNCLASSIFIED//FOUO` |
| `NWS_USER_AGENT` | Identifies the app to the weather service; include a monitored contact |

### Notes

- `PORT` and, on the ops service, `DATABASE_URL` are injected by Railway. Do
  not set them by hand.
- Migrations run at boot and are idempotent, so both services running them is
  safe.
- `SESSION_SECRET` may differ per service. Sessions are per-domain and do not
  need to match across the two links.
- If you change `VITE_APP_MODE` later, trigger a redeploy so the frontend
  rebuilds with the new value.

### Optional email

Set `SENDGRID_API_KEY`, `FROM_ADDRESS`, and `RECIPIENT_1..4` on the ops
service to enable the Email button on reports. Without them the app runs
normally and reports stay downloadable. `FROM_ADDRESS` must be a verified
SendGrid sender.

## Run locally

Prerequisites: Node 20 or newer, and a local PostgreSQL instance.

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set `SCORER_PASSWORD`, `ADMIN_PASSWORD`, `VIEWER_PASSWORD`,
   `SESSION_SECRET`, and `DATABASE_URL`.

3. Make sure Postgres is running and `DATABASE_URL` points at it, for example
   `postgres://dsuser:dspass@127.0.0.1:5432/dronesmoke`.

### Run the ops console (data entry)

Two terminals. The API server serves both links, so it is shared.

```bash
# Terminal 1: API and report server on port 3001
PORT=3001 node server/index.js

# Terminal 2: Vite dev server on 3000, proxies /api to 3001
npm run dev
```

Open `http://localhost:3000` and sign in with the scorer or admin password.

### Run the read-only board

Reuse the same API server from Terminal 1. Start a second Vite dev server in
board mode on a different port. Its `/api` calls proxy to the same 3001 server.

```bash
# Terminal 3: board frontend on 3002
VITE_APP_MODE=board npm run dev -- --port 3002
```

Open `http://localhost:3002` and sign in with the viewer password. You now
have both links running against one database, mirroring the Railway setup.

### Production-style local build

To preview exactly what Railway builds, build then serve a single process.
Run one mode at a time, since both use the same port.

```bash
# Ops console
npm run build && PORT=3001 npm start        # http://localhost:3001

# Read-only board
VITE_APP_MODE=board npm run build && PORT=3001 npm start   # http://localhost:3001
```

### Tests and linting

```bash
npm test        # unit tests (node:test), no extra dependencies
npm run lint    # ESLint across server, client, and tests
```

## The read-only board in detail

The board is a running tally sheet, the only thing viewers see. It shows the
day scoreboard (logged, hits, Pk, status), the live range weather with the
GO / CAUTION / NO-FLY estimate per UAS Group, and every scored item with the
weather captured at scoring time. Fleet, schedule, feedback, past days, and
report downloads are not visible to viewers; the server exposes viewers a
single read-only endpoint, so the rest is hidden at the API level, not just
in the UI. The tally polls every few seconds, so it tracks scorer entries in
near real time. Scorers and admins keep the full application through the ops
console with the existing passwords.

## Flying conditions

The Conditions page shows range weather and a GO / CAUTION / NO-FLY estimate
per UAS Group. Ratings apply DoD Group thresholds for wind (mph), visibility
(statute miles), and temperature (F), and use the greater of sustained and
gust wind, reflecting the two-thirds wind principle. Visibility applies to
Groups 1 through 3 and is treated as instrument-based for Groups 4 and 5.
Thresholds live in `server/conditions.js`, are covered by unit tests, and are
easy to tune. They are range-safety estimates; confirm against local rules
before flight.

## Architecture

```
Ops console service  (VITE_APP_MODE unset)   ─┐
Read-only board svc  (VITE_APP_MODE=board)   ─┤─▶ shared PostgreSQL
                                              │
Each service: React SPA + Express (server/)
  /api/auth       signed cookie sessions, three roles
  /api/*          catalog, operations, support (scorer/admin writes)
  /api/public/*   read-only mirror and conditions (viewer and up)
  weather.js      National Weather Service client
  conditions.js   DoD-threshold flying-conditions estimator
  wor.js          pdfmake vector report builder
```

The database schema is created at boot; there is no separate migration step.

## Data notes

- Probability of kill (Pk) counts successful intercepts against attempted
  intercepts. Runs marked "No Attempt" are excluded from the denominator.
- Weather is captured per engagement and summarized in the report. If the
  weather service is briefly unreachable, scoring still proceeds and the app
  serves the last good reading, marked stale, so the board never blanks.
- Closing a day runs in a single transaction that locks the day row, so the
  report sequence number cannot collide. Closing writes a numbered report
  (`WOR-YYYYMMDD-NN`). An admin can reopen a day; the next closeout writes the
  next sequence number.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with API proxy |
| `npm run build` | Build the frontend to `dist/` |
| `npm run start` | Run the API and report server |
| `npm run lint` | ESLint across server and client |
| `npm test` | Run the unit test suite (node:test) |

## Optional: standalone weather board

The `public-conditions/` folder is a separate, zero-dependency service that
serves only weather and flying conditions on its own URL, independent of the
main app and database. It is optional. See `public-conditions/README.md` for
its own deploy steps. Most deployments do not need it, since the read-only
board already shows conditions.
