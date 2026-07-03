import express from "express";
import { requireRole } from "../auth.js";
import { asId, asOptionalNumber, asText, requiredText } from "../validate.js";

/**
 * Drone and interceptor catalogs. Scorers add entries live in the
 * field; only admin can edit or delete existing entries.
 */

const UNIQUE_VIOLATION = "23505";

/** @returns {object | null} Validated drone payload, or null. */
function parseDrone(body) {
  const name = requiredText(body?.name, 120);
  if (!name) {
    return null;
  }
  return {
    name,
    uasGroup: asText(body?.uasGroup, 20),
    airframe: asText(body?.airframe, 60),
    weightKg: asOptionalNumber(body?.weightKg, 0, 100000),
    maxSpeedMs: asOptionalNumber(body?.maxSpeedMs, 0, 2000),
    propulsion: asText(body?.propulsion, 60),
    controlLink: asText(body?.controlLink, 120),
    notes: asText(body?.notes, 2000),
  };
}

/** Maps a drone row to the API shape. */
function droneToApi(row) {
  return {
    id: Number(row.id),
    name: row.name,
    uasGroup: row.uas_group,
    airframe: row.airframe,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    maxSpeedMs: row.max_speed_ms === null ? null : Number(row.max_speed_ms),
    propulsion: row.propulsion,
    controlLink: row.control_link,
    notes: row.notes,
  };
}

/** Standard handler for uniqueness conflicts and unexpected errors. */
function handleDbError(res, error, action) {
  if (error?.code === UNIQUE_VIOLATION) {
    return res.status(409).json({ success: false, error: "That name already exists." });
  }
  console.error(`${action} failed:`, error?.message);
  return res.status(500).json({ success: false, error: `Failed to ${action}.` });
}

/** @param {import("pg").Pool} pool */
export function createCatalogRouter(pool) {
  const router = express.Router();

  router.get("/drones", requireRole("scorer"), async (_req, res) => {
    try {
      const result = await pool.query("SELECT * FROM drones ORDER BY name ASC");
      return res.json({ success: true, drones: result.rows.map(droneToApi) });
    } catch (error) {
      return handleDbError(res, error, "load drones");
    }
  });

  router.post("/drones", requireRole("scorer"), async (req, res) => {
    const drone = parseDrone(req.body);
    if (!drone) {
      return res.status(400).json({ success: false, error: "Drone name is required." });
    }
    try {
      const result = await pool.query(
        `INSERT INTO drones (name, uas_group, airframe, weight_kg, max_speed_ms, propulsion, control_link, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          drone.name,
          drone.uasGroup,
          drone.airframe,
          drone.weightKg,
          drone.maxSpeedMs,
          drone.propulsion,
          drone.controlLink,
          drone.notes,
        ]
      );
      return res.json({ success: true, drone: droneToApi(result.rows[0]) });
    } catch (error) {
      return handleDbError(res, error, "add drone");
    }
  });

  router.put("/drones/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    const drone = parseDrone(req.body);
    if (!id || !drone) {
      return res.status(400).json({ success: false, error: "Valid id and name are required." });
    }
    try {
      const result = await pool.query(
        `UPDATE drones SET name=$1, uas_group=$2, airframe=$3, weight_kg=$4,
         max_speed_ms=$5, propulsion=$6, control_link=$7, notes=$8 WHERE id=$9 RETURNING *`,
        [
          drone.name,
          drone.uasGroup,
          drone.airframe,
          drone.weightKg,
          drone.maxSpeedMs,
          drone.propulsion,
          drone.controlLink,
          drone.notes,
          id,
        ]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Drone not found." });
      }
      return res.json({ success: true, drone: droneToApi(result.rows[0]) });
    } catch (error) {
      return handleDbError(res, error, "update drone");
    }
  });

  router.delete("/drones/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM drones WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Drone not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      return handleDbError(res, error, "delete drone");
    }
  });

  router.get("/interceptors", requireRole("scorer"), async (_req, res) => {
    try {
      const result = await pool.query("SELECT * FROM interceptors ORDER BY name ASC");
      const interceptors = result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        vendor: row.vendor,
        notes: row.notes,
      }));
      return res.json({ success: true, interceptors });
    } catch (error) {
      return handleDbError(res, error, "load interceptors");
    }
  });

  router.post("/interceptors", requireRole("scorer"), async (req, res) => {
    const name = requiredText(req.body?.name, 120);
    if (!name) {
      return res.status(400).json({ success: false, error: "Interceptor name is required." });
    }
    try {
      const result = await pool.query(
        "INSERT INTO interceptors (name, vendor, notes) VALUES ($1, $2, $3) RETURNING id",
        [name, asText(req.body?.vendor, 120), asText(req.body?.notes, 2000)]
      );
      return res.json({ success: true, id: Number(result.rows[0].id) });
    } catch (error) {
      return handleDbError(res, error, "add interceptor");
    }
  });

  router.put("/interceptors/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    const name = requiredText(req.body?.name, 120);
    if (!id || !name) {
      return res.status(400).json({ success: false, error: "Valid id and name are required." });
    }
    try {
      const result = await pool.query(
        "UPDATE interceptors SET name=$1, vendor=$2, notes=$3 WHERE id=$4",
        [name, asText(req.body?.vendor, 120), asText(req.body?.notes, 2000), id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Interceptor not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      return handleDbError(res, error, "update interceptor");
    }
  });

  router.delete("/interceptors/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM interceptors WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Interceptor not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      return handleDbError(res, error, "delete interceptor");
    }
  });

  return router;
}
