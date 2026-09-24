import express from "express";
import { requireRole } from "../auth.js";
import { generateFinalReport } from "../final-report.js";
import { asIsoDate } from "../validate.js";
import { loadMatrixProfiles } from "./operations.js";

/**
 * The final evaluation report. It spans every closed day in an optional
 * date range and is generated on request, never stored, so it always
 * reflects the current runs, closeouts, and benchmarks.
 */

/** @returns {string | null} A YYYY-MM-DD string naming a real calendar day, or null. */
function asCalendarDate(value) {
  const iso = asIsoDate(value);
  if (iso === null) {
    return null;
  }
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * @param {object} query Raw query string values.
 * @returns {{ ok: true, from: string | null, to: string | null } | { ok: false, error: string }}
 */
export function parseReportRange(query) {
  const bounds = {};
  for (const key of ["from", "to"]) {
    const raw = query?.[key];
    const blank = raw === undefined || raw === "";
    bounds[key] = blank ? null : asCalendarDate(raw);
    if (!blank && bounds[key] === null) {
      return { ok: false, error: `${key} must be a date as YYYY-MM-DD.` };
    }
  }
  if (bounds.from !== null && bounds.to !== null && bounds.from > bounds.to) {
    return { ok: false, error: "The start date must not be after the end date." };
  }
  return { ok: true, from: bounds.from, to: bounds.to };
}

/** @returns {Promise<object[]>} Closed days in the range, oldest first. */
async function loadClosedDays(pool, range) {
  const result = await pool.query(
    `SELECT id, to_char(day_date, 'YYYY-MM-DD') AS day_date, location_name, latitude, longitude,
            weather_note, false_alarms, operating_minutes, system_aborts, repair_minutes,
            operate_crew, setup_crew, setup_minutes
     FROM days
     WHERE status = 'closed'
       AND ($1::date IS NULL OR day_date >= $1::date)
       AND ($2::date IS NULL OR day_date <= $2::date)
     ORDER BY day_date ASC`,
    [range.from, range.to]
  );
  return result.rows;
}

/** @returns {Promise<object[]>} Every run on the given days, oldest first. */
async function loadEngagements(pool, dayIds) {
  const result = await pool.query(
    `SELECT e.*, d.name AS drone_name, d.uas_group, i.name AS interceptor_name,
            i.profile AS interceptor_profile, i.profile_sources AS interceptor_profile_sources
     FROM engagements e
     LEFT JOIN drones d ON d.id = e.drone_id
     LEFT JOIN interceptors i ON i.id = e.interceptor_id
     WHERE e.day_id = ANY($1::bigint[])
     ORDER BY e.occurred_at ASC`,
    [dayIds]
  );
  return result.rows;
}

/** @returns {Promise<Map<string, string>>} Latest WOR control number by day id. */
async function loadControlNumbers(pool, dayIds) {
  const result = await pool.query(
    `SELECT DISTINCT ON (day_id) day_id, control_number
     FROM wor_reports WHERE day_id = ANY($1::bigint[])
     ORDER BY day_id, id DESC`,
    [dayIds]
  );
  return new Map(result.rows.map((row) => [String(row.day_id), row.control_number]));
}

/** @returns {Promise<object | null>} Report input, or null when no day is closed in the range. */
async function loadReportInput(pool, range) {
  const days = await loadClosedDays(pool, range);
  if (days.length === 0) {
    return null;
  }
  const dayIds = days.map((day) => day.id);
  const engagements = await loadEngagements(pool, dayIds);
  const benchmarks = await pool.query("SELECT * FROM benchmarks");
  const matrixProfiles = await loadMatrixProfiles(pool);
  const controlNumbers = await loadControlNumbers(pool, dayIds);
  return { days, engagements, benchmarkRows: benchmarks.rows, matrixProfiles, controlNumbers };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ timezone: string, worClassification: string }} config
 */
export function createReportsRouter(pool, config) {
  const router = express.Router();

  router.get("/reports/final.pdf", requireRole("scorer"), async (req, res) => {
    const range = parseReportRange(req.query);
    if (!range.ok) {
      return res.status(400).json({ success: false, error: range.error });
    }
    try {
      const input = await loadReportInput(pool, range);
      if (input === null) {
        return res.status(404).json({ success: false, error: "No closed days fall in that range." });
      }
      const report = await generateFinalReport({ ...input, timezone: config.timezone, classification: config.worClassification });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${report.controlNumber}.pdf"`);
      return res.send(report.buffer);
    } catch (error) {
      console.error("Final report failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to build the final report." });
    }
  });

  return router;
}
