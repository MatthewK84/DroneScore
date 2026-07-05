import express from "express";
import { assessFlyingConditions } from "../conditions.js";
import { requireRole } from "../auth.js";
import { operationalDate } from "../time.js";
import { getCurrentWeather } from "../weather.js";

/**
 * Public conditions. A read-only endpoint behind the viewer role returns
 * current weather and a flying-conditions rating per UAS group. It exposes
 * no scores, engagements, drone names, or notes. Scorers, admins, and
 * viewers all call it, giving every signed-in role one shared source.
 */

const WEATHER_DEADLINE_MS = 8000;

/** @returns {{ locationName: string, latitude: number, longitude: number }} */
function pickLocation(row) {
  return {
    locationName: row.location_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

/**
 * Resolves the coordinates to report on without creating a day row, so an
 * anonymous request never mutates operational data.
 * @param {import("pg").Pool} pool
 * @param {object} config
 * @returns {Promise<{ locationName: string, latitude: number, longitude: number }>}
 */
async function resolveLocation(pool, config) {
  const today = operationalDate(config.timezone);
  const todayRow = await pool.query(
    "SELECT location_name, latitude, longitude FROM days WHERE day_date = $1",
    [today]
  );
  if (todayRow.rowCount > 0) {
    return pickLocation(todayRow.rows[0]);
  }
  const recent = await pool.query(
    "SELECT location_name, latitude, longitude FROM days ORDER BY day_date DESC LIMIT 1"
  );
  if (recent.rowCount > 0) {
    return pickLocation(recent.rows[0]);
  }
  return {
    locationName: config.defaultLocationName,
    latitude: config.defaultLatitude,
    longitude: config.defaultLongitude,
  };
}

/** Weather lookup bounded by a deadline so the page never hangs. */
async function boundedWeather(location, config) {
  const deadline = new Promise((resolve) => {
    setTimeout(() => resolve(null), WEATHER_DEADLINE_MS);
  });
  try {
    return await Promise.race([
      getCurrentWeather(location.latitude, location.longitude, config.nwsUserAgent),
      deadline,
    ]);
  } catch {
    return null;
  }
}

/** Module-scoped last-good observation, so a brief outage never blanks the view. */
let lastObservation = { weather: null, at: 0 };

/**
 * @param {import("pg").Pool} pool
 * @param {object} config
 */
export function createPublicRouter(pool, config) {
  const router = express.Router();

  router.get("/public/conditions", requireRole("viewer"), async (_req, res) => {
    try {
      const location = await resolveLocation(pool, config);
      const fresh = await boundedWeather(location, config);
      let weather = fresh;
      let stale = false;
      if (fresh) {
        lastObservation = { weather: fresh, at: Date.now() };
      } else if (lastObservation.weather) {
        weather = lastObservation.weather;
        stale = true;
      }
      const assessments = assessFlyingConditions(weather);
      return res.json({
        success: true,
        location: location.locationName,
        coordinates: { latitude: location.latitude, longitude: location.longitude },
        weather,
        stale,
        assessments,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Public conditions failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load conditions." });
    }
  });

  return router;
}
