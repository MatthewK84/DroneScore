import express from "express";
import { computeDayStats } from "../analytics.js";
import { requireRole } from "../auth.js";
import { operationalDate } from "../time.js";

/**
 * Read-only tally for the viewer role. Viewers see exactly one thing:
 * today's scored items with the weather captured at scoring time, plus
 * the day rollup. Fleet, schedule, feedback, past days, and reports are
 * not exposed here, so the general population sees the tally and nothing
 * else. Scorers and admins use the full authed routes instead.
 */

/** @returns {object} Public shape of a day row. */
function mapDay(row) {
  return {
    id: Number(row.id),
    date: row.day_date instanceof Date ? row.day_date.toISOString().slice(0, 10) : row.day_date,
    locationName: row.location_name,
    status: row.status,
  };
}

/** @returns {object} Tally shape of an engagement row, weather included. */
function mapEngagement(row) {
  return {
    id: Number(row.id),
    sortie: row.sortie,
    droneName: row.drone_name || null,
    interceptorName: row.interceptor_name || null,
    outcome: row.outcome,
    timeToInterceptS: row.time_to_intercept_s === null ? null : Number(row.time_to_intercept_s),
    engagementRangeM: row.engagement_range_m === null ? null : Number(row.engagement_range_m),
    notes: row.notes,
    weather: row.weather,
    occurredAt: row.occurred_at,
  };
}

/**
 * Finds today's day, else the most recent, without ever creating one.
 * @param {import("pg").Pool} pool
 * @param {object} config
 * @returns {Promise<object|null>}
 */
async function findDisplayDay(pool, config) {
  const today = operationalDate(config.timezone);
  const todayRow = await pool.query("SELECT * FROM days WHERE day_date = $1", [today]);
  if (todayRow.rowCount > 0) {
    return todayRow.rows[0];
  }
  const recent = await pool.query("SELECT * FROM days ORDER BY day_date DESC LIMIT 1");
  return recent.rowCount > 0 ? recent.rows[0] : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} config
 */
export function createReadonlyRouter(pool, config) {
  const router = express.Router();
  router.use(requireRole("viewer"));

  router.get("/public/day/current", async (_req, res) => {
    try {
      const dayRow = await findDisplayDay(pool, config);
      if (!dayRow) {
        return res.json({ success: true, day: null, engagements: [], stats: null });
      }
      const result = await pool.query(
        `SELECT e.*, d.name AS drone_name, d.uas_group, i.name AS interceptor_name
         FROM engagements e
         LEFT JOIN drones d ON d.id = e.drone_id
         LEFT JOIN interceptors i ON i.id = e.interceptor_id
         WHERE e.day_id = $1
         ORDER BY e.occurred_at ASC`,
        [dayRow.id]
      );
      const stats = computeDayStats(result.rows, config.timezone);
      return res.json({
        success: true,
        day: mapDay(dayRow),
        engagements: result.rows.map(mapEngagement),
        stats,
      });
    } catch (error) {
      console.error("Public day failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the day." });
    }
  });

  return router;
}
