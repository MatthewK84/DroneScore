import express from "express";
import { computeDayStats } from "../analytics.js";
import { requireRole } from "../auth.js";
import { buildProgress } from "../systems.js";
import { operationalDate } from "../time.js";

/**
 * Read-only routes for the viewer role, which is the general population.
 * Viewers see two things: today's scored items with the weather captured at
 * scoring time and the day rollup, and each interceptor's progress toward
 * JIATF 401 C4 criteria compliance.
 *
 * Progress is published as scores and counts only. Measured values,
 * Threshold and Objective figures, benchmark bases, and anything from the
 * system profile stay behind the scorer and admin routes: the profile holds
 * accreditation dates and cybersecurity findings, and a benchmark tells a
 * reader exactly what performance the evaluation will accept. Fleet,
 * schedule, feedback, past days, and reports are not exposed here either.
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
    runType: row.run_type || "red_air",
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

  /**
   * Cumulative progress of every interceptor, scored on every run it has
   * flown across the whole evaluation. Recomputed on each request; the
   * board polls it slowly because progress moves by the run, not the second.
   */
  router.get("/public/progress", async (_req, res) => {
    try {
      const engagements = await pool.query(
        `SELECT e.*, to_char(dy.day_date, 'YYYY-MM-DD') AS day_date, d.uas_group,
                i.name AS interceptor_name, i.profile AS interceptor_profile,
                i.profile_sources AS interceptor_profile_sources
         FROM engagements e
         JOIN days dy ON dy.id = e.day_id
         LEFT JOIN drones d ON d.id = e.drone_id
         LEFT JOIN interceptors i ON i.id = e.interceptor_id
         ORDER BY e.occurred_at ASC`
      );
      const days = await pool.query(
        `SELECT id, to_char(day_date, 'YYYY-MM-DD') AS day_date, false_alarms, operating_minutes,
                system_aborts, repair_minutes, operate_crew, setup_crew, setup_minutes
         FROM days ORDER BY day_date ASC`
      );
      const benchmarks = await pool.query("SELECT * FROM benchmarks");
      const progress = buildProgress(engagements.rows, days.rows, benchmarks.rows, config.timezone);
      return res.json({ success: true, ...progress });
    } catch (error) {
      console.error("Public progress failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load criteria progress." });
    }
  });

  return router;
}
