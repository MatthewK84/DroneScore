import express from "express";
import { requireRole } from "../auth.js";
import { computeDayStats } from "../analytics.js";
import { formatDateLong, operationalDate } from "../time.js";
import { asId, asOptionalNumber, asOutcome, asText } from "../validate.js";
import { getCurrentWeather } from "../weather.js";
import { generateWor } from "../wor.js";

/**
 * Operational days, engagements, and Warfighter Observation Reports.
 * Scorers log engagements against the open day. Admin closes the day,
 * which locks scoring and generates the WOR.
 */

const WEATHER_DEADLINE_MS = 8000;

/** Maps a day row to the API shape. */
function dayToApi(row) {
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

/** Maps an engagement row (joined with names) to the API shape. */
function engagementToApi(row) {
  return {
    id: Number(row.id),
    dayId: Number(row.day_id),
    sortie: row.sortie,
    droneId: row.drone_id === null ? null : Number(row.drone_id),
    droneName: row.drone_name || null,
    interceptorId: row.interceptor_id === null ? null : Number(row.interceptor_id),
    interceptorName: row.interceptor_name || null,
    outcome: row.outcome,
    timeToInterceptS: row.time_to_intercept_s === null ? null : Number(row.time_to_intercept_s),
    engagementRangeM: row.engagement_range_m === null ? null : Number(row.engagement_range_m),
    altitudeM: row.altitude_m === null ? null : Number(row.altitude_m),
    notes: row.notes,
    weather: row.weather,
    occurredAt: row.occurred_at,
  };
}

/** Finds or creates the day row for today's operational date. */
async function getOrCreateToday(pool, config) {
  const today = operationalDate(config.timezone);
  const found = await pool.query("SELECT * FROM days WHERE day_date = $1", [today]);
  if (found.rowCount > 0) {
    return found.rows[0];
  }
  const created = await pool.query(
    `INSERT INTO days (day_date, location_name, latitude, longitude)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (day_date) DO UPDATE SET day_date = EXCLUDED.day_date
     RETURNING *`,
    [today, config.defaultLocationName, config.defaultLatitude, config.defaultLongitude]
  );
  return created.rows[0];
}

/** Loads engagements for a day joined with drone and interceptor names. */
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

/** Weather lookup bounded by a hard deadline so scoring never stalls. */
async function snapshotWeather(day, config) {
  const deadline = new Promise((resolve) => {
    setTimeout(() => resolve(null), WEATHER_DEADLINE_MS);
  });
  try {
    return await Promise.race([
      getCurrentWeather(Number(day.latitude), Number(day.longitude), config.nwsUserAgent),
      deadline,
    ]);
  } catch {
    return null;
  }
}

/** @returns {object | null} Validated engagement payload, or null. */
function parseEngagement(body) {
  const outcome = asOutcome(body?.outcome);
  if (!outcome) {
    return null;
  }
  return {
    sortie: asText(body?.sortie, 60),
    droneId: asId(body?.droneId),
    interceptorId: asId(body?.interceptorId),
    outcome,
    timeToInterceptS: asOptionalNumber(body?.timeToInterceptS, 0, 86400),
    engagementRangeM: asOptionalNumber(body?.engagementRangeM, 0, 1000000),
    altitudeM: asOptionalNumber(body?.altitudeM, 0, 30000),
    notes: asText(body?.notes, 4000),
  };
}

/**
 * Closes a day in a single transaction: locks the day row, generates the
 * WOR, stores it, and flips the status. The row lock serializes concurrent
 * closes, so the report sequence number cannot collide.
 * @param {import("pg").Pool} pool
 * @param {object} config
 * @param {number} dayId
 * @returns {Promise<{ notFound?: boolean, reportId?: number, controlNumber?: string }>}
 */
async function closeDayAtomic(pool, config, dayId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dayResult = await client.query("SELECT * FROM days WHERE id = $1 FOR UPDATE", [dayId]);
    if (dayResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return { notFound: true };
    }
    const day = dayResult.rows[0];
    const engagementResult = await client.query(
      `SELECT e.*, d.name AS drone_name, d.uas_group, i.name AS interceptor_name
       FROM engagements e
       LEFT JOIN drones d ON d.id = e.drone_id
       LEFT JOIN interceptors i ON i.id = e.interceptor_id
       WHERE e.day_id = $1 ORDER BY e.occurred_at ASC`,
      [dayId]
    );
    const stats = computeDayStats(engagementResult.rows, config.timezone);
    const seqResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM wor_reports WHERE day_id = $1",
      [dayId]
    );
    const report = await generateWor({
      day: dayToApiRowShape(day),
      engagements: engagementResult.rows,
      stats,
      reportSeq: seqResult.rows[0].count + 1,
      timezone: config.timezone,
      classification: config.worClassification,
    });
    const inserted = await client.query(
      "INSERT INTO wor_reports (day_id, control_number, pdf) VALUES ($1, $2, $3) RETURNING id",
      [dayId, report.controlNumber, report.buffer]
    );
    await client.query("UPDATE days SET status='closed', closed_at=now() WHERE id=$1", [dayId]);
    await client.query("COMMIT");
    return { reportId: Number(inserted.rows[0].id), controlNumber: report.controlNumber };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Normalizes day_date to a plain YYYY-MM-DD string for the WOR builder. */
function dayToApiRowShape(row) {
  const date =
    row.day_date instanceof Date ? row.day_date.toISOString().slice(0, 10) : row.day_date;
  return { ...row, day_date: date };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} config
 * @param {{ enabled: boolean, sendWor: Function }} mailer
 */
export function createOperationsRouter(pool, config, mailer) {
  const router = express.Router();

  router.get("/days/current", requireRole("scorer"), async (_req, res) => {
    try {
      const day = await getOrCreateToday(pool, config);
      const engagements = await loadDayEngagements(pool, day.id);
      const stats = computeDayStats(engagements, config.timezone);
      return res.json({
        success: true,
        day: dayToApi(day),
        engagements: engagements.map(engagementToApi),
        stats,
      });
    } catch (error) {
      console.error("Load current day failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load today." });
    }
  });

  router.get("/days", requireRole("scorer"), async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT d.*,
           (SELECT COUNT(*)::int FROM engagements e WHERE e.day_id = d.id) AS engagement_count,
           (SELECT w.id FROM wor_reports w WHERE w.day_id = d.id ORDER BY w.id DESC LIMIT 1) AS wor_id,
           (SELECT w.control_number FROM wor_reports w WHERE w.day_id = d.id ORDER BY w.id DESC LIMIT 1) AS wor_control
         FROM days d ORDER BY d.day_date DESC LIMIT 60`
      );
      const days = result.rows.map((row) => ({
        ...dayToApi(row),
        engagementCount: row.engagement_count,
        worId: row.wor_id === null ? null : Number(row.wor_id),
        worControlNumber: row.wor_control,
      }));
      return res.json({ success: true, days });
    } catch (error) {
      console.error("Load days failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load days." });
    }
  });

  router.put("/days/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    const locationName = asText(req.body?.locationName, 200);
    const latitude = asOptionalNumber(req.body?.latitude, -90, 90);
    const longitude = asOptionalNumber(req.body?.longitude, -180, 180);
    if (!id || !locationName || latitude === null || longitude === null) {
      return res
        .status(400)
        .json({ success: false, error: "Location name and valid coordinates are required." });
    }
    try {
      const result = await pool.query(
        `UPDATE days SET location_name=$1, latitude=$2, longitude=$3, weather_note=$4
         WHERE id=$5 RETURNING *`,
        [locationName, latitude, longitude, asText(req.body?.weatherNote, 2000), id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Day not found." });
      }
      return res.json({ success: true, day: dayToApi(result.rows[0]) });
    } catch (error) {
      console.error("Update day failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to update day." });
    }
  });

  router.post("/engagements", requireRole("scorer"), async (req, res) => {
    const payload = parseEngagement(req.body);
    if (!payload) {
      return res.status(400).json({ success: false, error: "A valid outcome is required." });
    }
    try {
      const day = await getOrCreateToday(pool, config);
      if (day.status !== "open") {
        return res
          .status(409)
          .json({ success: false, error: "Today is closed. An admin can reopen it." });
      }
      const weather = await snapshotWeather(day, config);
      const inserted = await pool.query(
        `INSERT INTO engagements
           (day_id, sortie, drone_id, interceptor_id, outcome,
            time_to_intercept_s, engagement_range_m, altitude_m, notes, weather)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          day.id,
          payload.sortie,
          payload.droneId,
          payload.interceptorId,
          payload.outcome,
          payload.timeToInterceptS,
          payload.engagementRangeM,
          payload.altitudeM,
          payload.notes,
          weather === null ? null : JSON.stringify(weather),
        ]
      );
      return res.json({ success: true, id: Number(inserted.rows[0].id) });
    } catch (error) {
      console.error("Insert engagement failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save engagement." });
    }
  });

  router.put("/engagements/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    const payload = parseEngagement(req.body);
    if (!id || !payload) {
      return res.status(400).json({ success: false, error: "Valid id and outcome are required." });
    }
    try {
      const result = await pool.query(
        `UPDATE engagements SET sortie=$1, drone_id=$2, interceptor_id=$3, outcome=$4,
           time_to_intercept_s=$5, engagement_range_m=$6, altitude_m=$7, notes=$8
         WHERE id=$9`,
        [
          payload.sortie,
          payload.droneId,
          payload.interceptorId,
          payload.outcome,
          payload.timeToInterceptS,
          payload.engagementRangeM,
          payload.altitudeM,
          payload.notes,
          id,
        ]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Engagement not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Update engagement failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to update engagement." });
    }
  });

  router.delete("/engagements/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM engagements WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Engagement not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete engagement failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to delete engagement." });
    }
  });

  router.post("/days/:id/close", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await closeDayAtomic(pool, config, id);
      if (result.notFound) {
        return res.status(404).json({ success: false, error: "Day not found." });
      }
      return res.json({ success: true, reportId: result.reportId, controlNumber: result.controlNumber });
    } catch (error) {
      console.error("Close day failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to close the day." });
    }
  });

  router.post("/days/:id/reopen", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query(
        "UPDATE days SET status='open', closed_at=NULL WHERE id=$1",
        [id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Day not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Reopen day failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to reopen the day." });
    }
  });

  router.get("/days/:id/wor.pdf", requireRole("scorer"), async (req, res) => {
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
      console.error("Fetch WOR failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the report." });
    }
  });

  router.post("/days/:id/wor/email", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query(
        `SELECT w.control_number, w.pdf, d.day_date FROM wor_reports w
         JOIN days d ON d.id = w.day_id
         WHERE w.day_id=$1 ORDER BY w.id DESC LIMIT 1`,
        [id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "No report exists for this day." });
      }
      const row = result.rows[0];
      const date = row.day_date instanceof Date ? row.day_date.toISOString().slice(0, 10) : row.day_date;
      const outcome = await mailer.sendWor(row.control_number, formatDateLong(date), row.pdf);
      if (!outcome.success) {
        return res.status(502).json(outcome);
      }
      return res.json(outcome);
    } catch (error) {
      console.error("Email WOR failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to email the report." });
    }
  });

  return router;
}
