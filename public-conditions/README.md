# Drone Smoke Conditions (public board)

A standalone public page showing range weather and a GO / CAUTION / NO-GO
flying-conditions estimate for each UAS group. It runs as its own service
with its own HTTPS URL and shares nothing with the scoring app, so it stays
up and consistent regardless of operator-side activity.

It has no runtime dependencies. Node's built-in HTTP server serves one page
and one endpoint (`GET /api/conditions`). The weather fetch runs server-side,
which is required because a browser cannot set the User-Agent that the
National Weather Service expects.

## Reliability

The service keeps the last good observation. If a later fetch to the weather
service fails, it serves the last reading marked "Last known reading" instead
of going blank. The page keeps its last render on a failed refresh and shows
"Reconnecting" rather than clearing.

## Deploy as a second Railway service

This folder lives inside the main repository. Add it as a separate service in
the same Railway project:

1. In your Railway project, choose **New** then **GitHub Repo** and pick the
   same repository.
2. Open the new service's **Settings**. Set **Root Directory** to
   `public-conditions`. Railway then builds and runs only this folder.
3. Railway detects Node and runs `npm run start`. There is no build step and
   nothing to install.
4. Under **Settings** then **Networking**, click **Generate Domain**. Railway
   issues an HTTPS URL for the public board.
5. Set the variables below, then redeploy.

The main scoring service keeps its own root directory and domain. The two
services are independent.

## Variables

| Variable | Purpose | Example |
|---|---|---|
| `RANGE_LATITUDE` | Range latitude for the weather lookup | `33.85` |
| `RANGE_LONGITUDE` | Range longitude | `-80.54` |
| `RANGE_LOCATION` | Label shown on the page | `Poinsett Range, Shaw AFB, SC` |
| `NWS_USER_AGENT` | Identifies you to the weather service; include a monitored contact | `DroneSmokeConditions/1.0 (you@us.af.mil)` |
| `APP_TITLE` | Page and browser title | `Drone Smoke Range Conditions` |

`PORT` is injected by Railway. Do not set it. If you would rather not name the
site publicly, set `RANGE_LOCATION` to a generic label; the weather itself is
public data.

## Run locally

```bash
cd public-conditions
RANGE_LATITUDE=33.85 RANGE_LONGITUDE=-80.54 \
  RANGE_LOCATION="Poinsett Range, Shaw AFB, SC" \
  NWS_USER_AGENT="DroneSmokeConditions/1.0 (you@example.mil)" \
  PORT=8080 npm run start
```

Open `http://localhost:8080`.

## Optional: track the admin-set day location

By default this service uses fixed coordinates from its variables, which keeps
it simple and independent. If you want it to follow the location an admin sets
in the scoring app, connect it to the same Railway Postgres (add a
`DATABASE_URL` reference variable) and read the latest `days` row. Ask and this
can be wired in.
