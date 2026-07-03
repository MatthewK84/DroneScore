import express from "express";
import { requireRole } from "../auth.js";
import { asId, asIsoDate, asText, requiredText } from "../validate.js";

/**
 * Schedule and feedback. Schedule events live in the database now,
 * so each evaluation window gets its own agenda without a redeploy.
 */

/** Maps a schedule row to the API shape. */
function scheduleToApi(row) {
  return {
    id: Number(row.id),
    eventDate:
      row.event_date instanceof Date ? row.event_date.toISOString().slice(0, 10) : row.event_date,
    timeLabel: row.time_label,
    title: row.title,
    details: row.details,
  };
}

/** @param {import("pg").Pool} pool */
export function createSupportRouter(pool) {
  const router = express.Router();

  router.get("/schedule", requireRole("scorer"), async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM schedule_events ORDER BY event_date ASC, time_label ASC, id ASC"
      );
      return res.json({ success: true, events: result.rows.map(scheduleToApi) });
    } catch (error) {
      console.error("Load schedule failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the schedule." });
    }
  });

  router.post("/schedule", requireRole("scorer"), async (req, res) => {
    const eventDate = asIsoDate(req.body?.eventDate);
    const title = requiredText(req.body?.title, 200);
    if (!eventDate || !title) {
      return res.status(400).json({ success: false, error: "Date and title are required." });
    }
    try {
      const result = await pool.query(
        `INSERT INTO schedule_events (event_date, time_label, title, details)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [eventDate, asText(req.body?.timeLabel, 20), title, asText(req.body?.details, 2000)]
      );
      return res.json({ success: true, event: scheduleToApi(result.rows[0]) });
    } catch (error) {
      console.error("Insert schedule failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save the event." });
    }
  });

  router.delete("/schedule/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM schedule_events WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Event not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete schedule failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to delete the event." });
    }
  });

  router.get("/feedback", requireRole("scorer"), async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, subject, message, created_at FROM feedback ORDER BY id DESC"
      );
      return res.json({ success: true, entries: result.rows });
    } catch (error) {
      console.error("Load feedback failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load feedback." });
    }
  });

  router.get("/feedback/full", requireRole("admin"), async (_req, res) => {
    try {
      const result = await pool.query("SELECT * FROM feedback ORDER BY id DESC");
      return res.json({ success: true, entries: result.rows });
    } catch (error) {
      console.error("Load full feedback failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load feedback." });
    }
  });

  router.post("/feedback", requireRole("scorer"), async (req, res) => {
    const name = requiredText(req.body?.name, 120);
    const subject = requiredText(req.body?.subject, 200);
    const message = requiredText(req.body?.message, 4000);
    if (!name || !subject || !message) {
      return res
        .status(400)
        .json({ success: false, error: "Name, subject, and message are required." });
    }
    try {
      const result = await pool.query(
        `INSERT INTO feedback (name, rank, unit, subject, message)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [name, asText(req.body?.rank, 60), asText(req.body?.unit, 120), subject, message]
      );
      return res.json({ success: true, id: Number(result.rows[0].id) });
    } catch (error) {
      console.error("Insert feedback failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save feedback." });
    }
  });

  router.delete("/feedback/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM feedback WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Entry not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete feedback failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to delete feedback." });
    }
  });

  return router;
}
