import express from "express";
import { requireRole } from "../auth.js";
import {
  buildTimelinePreview,
  parseBulkRequest,
  parseTimelineRequest,
  planBulkWrite,
} from "../benchmark-presets.js";
import { operationalDate } from "../time.js";
import { NON_KINETIC_DEFAULT, PAYLOAD_TYPES } from "../timeline-presets.js";
import { C4_ETA_60_180 } from "../timeline-profile.js";
import { benchmarkToApi, parseBenchmark } from "./criteria.js";

/**
 * Timeline-budget benchmark presets (C4 ETA 60 s / 180 s).
 *
 * Reading the presets is open to scorers, because a preview writes
 * nothing and scorers see the list read-only. Writing is admin only and
 * always goes through the bulk route, even for one row. The single-row
 * PUT would clear the Critical mark and skip the overwrite check.
 */

const FOREIGN_KEY_VIOLATION = "23503";

/** @returns {Promise<object[]>} Stored rows for the request scope, locked. */
async function lockScope(client, request) {
  const result = await client.query(
    `SELECT * FROM benchmarks
     WHERE COALESCE(interceptor_id, 0) = $1 AND uas_group = $2 AND kpp_id = ANY($3::text[])
     FOR UPDATE`,
    [request.interceptorId ?? 0, request.uasGroup, request.items.map((item) => item.kppId)]
  );
  return result.rows;
}

/** Upserts one item. The Critical mark on an existing row is never touched. */
async function upsertItem(client, request, item) {
  await client.query(
    `INSERT INTO benchmarks (interceptor_id, kpp_id, uas_group, threshold, objective, unit, basis)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (COALESCE(interceptor_id, 0), kpp_id, uas_group)
     DO UPDATE SET threshold=EXCLUDED.threshold, objective=EXCLUDED.objective,
       unit=EXCLUDED.unit, basis=EXCLUDED.basis, updated_at=now()`,
    [request.interceptorId, item.kppId, request.uasGroup, item.threshold, item.objective, item.unit, item.basis]
  );
}

/**
 * Applies a validated bulk request in one transaction. Conflicts without
 * confirmation roll the whole request back.
 *
 * @param {import("pg").Pool} pool
 * @param {object} request Output of parseBulkRequest.
 * @returns {Promise<{ conflicts: object[] } | { stored: object[], written: number, unchanged: number }>}
 */
export async function applyBulkWrite(pool, request) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const plan = planBulkWrite(await lockScope(client, request), request.items);
    if (plan.conflicts.length > 0 && !request.confirmOverwrite) {
      await client.query("ROLLBACK");
      return { conflicts: plan.conflicts };
    }
    for (const item of plan.writes) {
      await upsertItem(client, request, item);
    }
    const stored = await lockScope(client, request);
    await client.query("COMMIT");
    return { stored, written: plan.writes.length, unchanged: plan.unchanged.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** @returns {object} A 400 body listing every validation error. */
function invalid(errors) {
  return { success: false, error: errors.join(" "), errors };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ timezone: string }} config
 */
export function createBenchmarkPresetsRouter(pool, config) {
  const router = express.Router();

  router.get("/criteria/benchmarks/timeline-defaults", requireRole("scorer"), (_req, res) => {
    // TODO: serve saved named parameter sets here once they exist.
    return res.json({
      success: true,
      params: C4_ETA_60_180,
      payloadTypes: PAYLOAD_TYPES,
      defaultPayloadTypes: NON_KINETIC_DEFAULT,
    });
  });

  router.post("/criteria/benchmarks/derive-timeline", requireRole("scorer"), (req, res) => {
    const parsed = parseTimelineRequest(req.body);
    if (!parsed.ok) {
      return res.status(400).json(invalid(parsed.errors));
    }
    const preview = buildTimelinePreview(parsed.params, parsed.payloadTypes);
    return res.json({ success: true, ...preview });
  });

  router.put("/criteria/benchmarks/bulk", requireRole("admin"), async (req, res) => {
    const actor = { role: req.session.role, isoDate: operationalDate(config.timezone) };
    const parsed = parseBulkRequest(req.body, parseBenchmark, actor);
    if (!parsed.ok) {
      return res.status(400).json(invalid(parsed.errors));
    }
    try {
      const result = await applyBulkWrite(pool, parsed.request);
      if (result.conflicts) {
        const error = "Some rows already hold different benchmarks. Confirm the overwrite to replace them.";
        return res.status(409).json({ success: false, error, conflicts: result.conflicts });
      }
      const benchmarks = result.stored.map(benchmarkToApi);
      return res.json({ success: true, benchmarks, written: result.written, unchanged: result.unchanged });
    } catch (error) {
      if (error?.code === FOREIGN_KEY_VIOLATION) {
        return res.status(400).json(invalid(["The selected system no longer exists."]));
      }
      console.error("Bulk benchmark write failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to store the benchmarks." });
    }
  });

  return router;
}
