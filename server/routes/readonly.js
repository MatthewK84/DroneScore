import express from "express";
import { computeDayStats } from "../analytics.js";
import { requireRole } from "../auth.js";
import { operationalDate } from "../time.js";
import { asId } from "../validate.js";

/**
 * Read-only mirror of the operational data for the open view. Every route
 * is a GET behind the viewer role, so a signed-in viewer sees the same
 * pages as scorers and admins but can never change anything. Feedback is
 * returned without author identity, matching the scorer-level view rather
 * than the admin view.
 */

/** @returns {object} Public shape of a day row. */
function mapDay(row) {
  return {
    id: Number(row.id),
    date: row.day_date instanceof Date ? row.day_date.toISOString().slice(0, 10) : row.day_date,
    locationName: row.location_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    status: row.status,
    weatherNote: row.weather_note,
    closedAt: row.closed_at,
  };
}

/** @returns {object} Public shape of an engagement row joined with names. */
function mapEngagement(row) {
  return {
    id: Number(row.id),
    sortie: row.sortie,
    droneName: row.drone_name || null,
    interceptorName: row.interceptor_name || null,
    outcome: row.outcome,
    timeToInterceptS: row.time_to_intercept_s === null ? null : Number(row.time_to_intercept_s),
    engagementRangeM: row.engagement_range_m === null ? null : Number(row.engagement_range_m),
    altitudeM: row.altitude_m === null ? null : Number(row.altitude_m),
    notes: row.notes,
    occurredAt: row.occurred_at,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} dayId
 * @returns {Promise<object[]>} Engagement rows joined with drone and interceptor names.
 */
async function loadDayEngagements(pool, dayId) {
  const result = await pool.query(
    `SELECT e.*, d.name AS drone_name, d.uas_group, i.name AS interceptor_name
     FROM engagements e
     LEFT JOIN drones d ON d.id = e.drone_id
     LEFT JOIN interceptors i ON i.id = e.interceptor_id
     WHERE e.day_id = $1
     ORDER BY e.occurred_at ASC`,
    [dayId]
  );
  return result.rows;
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
      const engagements = await loadDayEngagements(pool, dayRow.id);
      const stats = computeDayStats(engagements, config.timezone);
      return res.json({
        success: true,
        day: mapDay(dayRow),
        engagements: engagements.map(mapEngagement),
        stats,
      });
    } catch (error) {
      console.error("Public day failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the day." });
    }
  });

  router.get("/public/days", async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT d.*,
           (SELECT COUNT(*)::int FROM engagements e WHERE e.day_id = d.id) AS engagement_count,
           (SELECT w.id FROM wor_reports w WHERE w.day_id = d.id ORDER BY w.id DESC LIMIT 1) AS wor_id,
           (SELECT w.control_number FROM wor_reports w WHERE w.day_id = d.id ORDER BY w.id DESC LIMIT 1) AS wor_control
         FROM days d ORDER BY d.day_date DESC LIMIT 60`
      );
      const days = result.rows.map((row) => ({
        ...mapDay(row),
        engagementCount: row.engagement_count,
        worId: row.wor_id === null ? null : Number(row.wor_id),
        worControlNumber: row.wor_control,
      }));
      return res.json({ success: true, days });
    } catch (error) {
      console.error("Public days failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load days." });
    }
  });

  router.get("/public/fleet", async (_req, res) => {
    try {
      const [drones, interceptors] = await Promise.all([
        pool.query("SELECT * FROM drones ORDER BY name ASC"),
        pool.query("SELECT id, name FROM interceptors ORDER BY name ASC"),
      ]);
      return res.json({
        success: true,
        drones: drones.rows.map((row) => ({
          id: Number(row.id),
          name: row.name,
          uasGroup: row.uas_group,
          airframe: row.airframe,
          weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
          maxSpeedMs: row.max_speed_ms === null ? null : Number(row.max_speed_ms),
          propulsion: row.propulsion,
          controlLink: row.control_link,
          notes: row.notes,
        })),
        interceptors: interceptors.rows.map((row) => ({ id: Number(row.id), name: row.name })),
      });
    } catch (error) {
      console.error("Public fleet failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the fleet." });
    }
  });

  router.get("/public/schedule", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM schedule_events ORDER BY event_date ASC, time_label ASC, id ASC"
      );
      const events = result.rows.map((row) => ({
        id: Number(row.id),
        eventDate:
          row.event_date instanceof Date
            ? row.event_date.toISOString().slice(0, 10)
            : row.event_date,
        timeLabel: row.time_label,
        title: row.title,
        details: row.details,
      }));
      return res.json({ success: true, events });
    } catch (error) {
      console.error("Public schedule failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the schedule." });
    }
  });

  router.get("/public/feedback", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, subject, message, created_at FROM feedback ORDER BY id DESC"
      );
      return res.json({ success: true, entries: result.rows });
    } catch (error) {
      console.error("Public feedback failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load feedback." });
    }
  });

  router.get("/public/days/:id/wor.pdf", async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query(
        "SELECT control_number, pdf FROM wor_reports WHERE day_id=$1 ORDER BY id DESC LIMIT 1",
        [id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "No report exists for this day." });
      }
      const { control_number: controlNumber, pdf } = result.rows[0];
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${controlNumber}.pdf"`);
      return res.send(pdf);
    } catch (error) {
      console.error("Public WOR failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the report." });
    }
  });

  return router;
}
