import express from "express";
import { requireRole } from "../auth.js";
import { buildCompliance, primaryGroup, primarySystem, resolveBenchmarks, summarizeCompliance } from "../compliance.js";
import { CRITERIA, deriveMops, KILL_CHAIN } from "../criteria.js";
import { catalogByCategory, isKnownKppId, KPP_CATALOG } from "../kpp-catalog.js";
import { deriveBenchmarks, GROUP_KINEMATICS } from "../thresholds.js";
import { asId, asOptionalInteger, asOptionalNumber, asProfile, asText, requiredText } from "../validate.js";

/**
 * Capability Characterization Criteria routes. Serves the framework as
 * data, stores the Threshold and Objective benchmarks that section 4.2
 * requires before test execution, holds the per-system profile answers,
 * and manages the test matrix.
 *
 * Reading is open to scorers because the catalog drives the capture UI.
 * Writing benchmarks, profiles, and the matrix is admin only: these are
 * the pre-test definitions an evaluation is judged against, so they must
 * not move because someone was tapping quickly at the range.
 */

const UNIQUE_VIOLATION = "23505";

/** Qualitative MOP keys that live alongside KPP answers in the profile. */
const NARRATIVE_MOP_KEYS = Object.freeze([
  "mop.4.1.1",
  "mop.4.1.2",
  "mop.5.1.1",
  "mop.5.2.1",
  "mop.5.3.1",
  "mop.5.3.2",
]);

/** @returns {boolean} True for any key the system profile may store. */
function isProfileKey(key) {
  return isKnownKppId(key) || NARRATIVE_MOP_KEYS.includes(key);
}

/** Maps a benchmark row to the API shape. */
function benchmarkToApi(row) {
  return {
    id: Number(row.id),
    interceptorId: row.interceptor_id === null ? null : Number(row.interceptor_id),
    kppId: row.kpp_id,
    uasGroup: row.uas_group,
    threshold: row.threshold === null ? null : Number(row.threshold),
    objective: row.objective === null ? null : Number(row.objective),
    unit: row.unit,
    basis: row.basis,
  };
}

/** @returns {object | null} Validated benchmark payload, or null. */
function parseBenchmark(body) {
  const kppId = asText(body?.kppId, 20);
  if (!isKnownKppId(kppId)) {
    return null;
  }
  return {
    kppId,
    interceptorId: asId(body?.interceptorId),
    uasGroup: asText(body?.uasGroup, 4),
    threshold: asOptionalNumber(body?.threshold, -1000000, 1000000),
    objective: asOptionalNumber(body?.objective, -1000000, 1000000),
    unit: asText(body?.unit, 20),
    basis: asText(body?.basis, 2000),
  };
}

/** @returns {object | null} Validated derivation request, or null. */
function parseDerivation(body) {
  const uasGroup = asText(body?.uasGroup, 4);
  const standoffM = asOptionalNumber(body?.standoffM, 0, 200000);
  const cycleS = asOptionalNumber(body?.cycleS, 1, 3600);
  const launchToDefeatS = asOptionalNumber(body?.launchToDefeatS, 1, 3600);
  if (!uasGroup || standoffM === null || cycleS === null || launchToDefeatS === null) {
    return null;
  }
  return { uasGroup, standoffM, cycleS, launchToDefeatS };
}

/** @returns {object | null} Validated day metrics payload, or null. */
function parseDayMetrics(body) {
  return {
    falseAlarms: asOptionalInteger(body?.falseAlarms, 100000),
    operatingMinutes: asOptionalNumber(body?.operatingMinutes, 0, 100000),
    systemAborts: asOptionalInteger(body?.systemAborts, 10000),
    repairMinutes: asOptionalNumber(body?.repairMinutes, 0, 100000),
    operateCrew: asOptionalInteger(body?.operateCrew, 1000),
    setupCrew: asOptionalInteger(body?.setupCrew, 1000),
    setupMinutes: asOptionalNumber(body?.setupMinutes, 0, 100000),
    sensorSource: asText(body?.sensorSource, 300),
  };
}

/** Maps a test profile row plus its targets to the API shape. */
function profileToApi(row, targets) {
  return {
    id: Number(row.id),
    code: row.code,
    mission: row.mission,
    timeOfDay: row.time_of_day,
    dataPointsRequired: Number(row.data_points_required),
    notes: row.notes,
    active: row.active,
    targets: targets.map((target) => ({
      id: Number(target.id),
      sequence: Number(target.sequence),
      targetName: target.target_name,
      droneId: target.drone_id === null ? null : Number(target.drone_id),
      elevationFtAgl: target.elevation_ft_agl === null ? null : Number(target.elevation_ft_agl),
      speedMph: target.speed_mph === null ? null : Number(target.speed_mph),
      launchPoint: target.launch_point,
    })),
  };
}

/** @returns {object[]} Sanitized target lines for a test profile. */
function parseTargets(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 12)
    .map((raw, index) => ({
      sequence: index + 1,
      targetName: requiredText(raw?.targetName, 120),
      droneId: asId(raw?.droneId),
      elevationFtAgl: asOptionalNumber(raw?.elevationFtAgl, 0, 60000),
      speedMph: asOptionalNumber(raw?.speedMph, 0, 2000),
      launchPoint: asText(raw?.launchPoint, 40),
    }))
    .filter((target) => target.targetName !== null);
}

/** @returns {object | null} Validated test profile payload, or null. */
function parseTestProfile(body) {
  const code = requiredText(body?.code, 20);
  if (!code) {
    return null;
  }
  return {
    code,
    mission: asText(body?.mission, 60),
    timeOfDay: asText(body?.timeOfDay, 20) || "Day",
    dataPointsRequired: asOptionalInteger(body?.dataPointsRequired, 1000) ?? 1,
    notes: asText(body?.notes, 1000),
    active: body?.active !== false,
    targets: parseTargets(body?.targets),
  };
}

/** Loads test profiles with their target lines attached. */
async function loadTestProfiles(pool) {
  const profiles = await pool.query("SELECT * FROM test_profiles ORDER BY code ASC");
  const targets = await pool.query("SELECT * FROM test_profile_targets ORDER BY profile_id, sequence");
  return profiles.rows.map((row) =>
    profileToApi(
      row,
      targets.rows.filter((target) => String(target.profile_id) === String(row.id))
    )
  );
}

/** Replaces a profile's target lines inside an open transaction. */
async function replaceTargets(client, profileId, targets) {
  await client.query("DELETE FROM test_profile_targets WHERE profile_id = $1", [profileId]);
  for (const target of targets) {
    await client.query(
      `INSERT INTO test_profile_targets
         (profile_id, sequence, target_name, drone_id, elevation_ft_agl, speed_mph, launch_point)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        profileId,
        target.sequence,
        target.targetName,
        target.droneId,
        target.elevationFtAgl,
        target.speedMph,
        target.launchPoint,
      ]
    );
  }
}

/** Writes a test profile and its targets in one transaction. */
async function saveTestProfile(pool, id, payload) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved =
      id === null
        ? await client.query(
            `INSERT INTO test_profiles (code, mission, time_of_day, data_points_required, notes, active)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [payload.code, payload.mission, payload.timeOfDay, payload.dataPointsRequired, payload.notes, payload.active]
          )
        : await client.query(
            `UPDATE test_profiles SET code=$1, mission=$2, time_of_day=$3,
               data_points_required=$4, notes=$5, active=$6 WHERE id=$7 RETURNING id`,
            [payload.code, payload.mission, payload.timeOfDay, payload.dataPointsRequired, payload.notes, payload.active, id]
          );
    if (saved.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const profileId = Number(saved.rows[0].id);
    await replaceTargets(client, profileId, payload.targets);
    await client.query("COMMIT");
    return profileId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Builds the criteria review package for one day: derived MOPs and the
 * KPP compliance table, exactly as they will appear on the report.
 */
async function buildReview(pool, config, dayId) {
  const dayResult = await pool.query("SELECT * FROM days WHERE id=$1", [dayId]);
  if (dayResult.rowCount === 0) {
    return null;
  }
  const day = dayResult.rows[0];
  const engagements = await pool.query(
    `SELECT e.*, d.name AS drone_name, d.uas_group, i.name AS interceptor_name, i.profile AS interceptor_profile
     FROM engagements e
     LEFT JOIN drones d ON d.id = e.drone_id
     LEFT JOIN interceptors i ON i.id = e.interceptor_id
     WHERE e.day_id=$1 ORDER BY e.occurred_at ASC`,
    [dayId]
  );
  const benchmarkRows = await pool.query("SELECT * FROM benchmarks");
  return assembleReview(day, engagements.rows, benchmarkRows.rows, config);
}

/**
 * @param {object} day
 * @param {object[]} rows
 * @param {object[]} benchmarkRows
 * @param {object} config
 * @returns {object} Criteria package shared by the review screen and the WOR.
 */
export function assembleReview(day, rows, benchmarkRows, config) {
  const redAir = rows.filter((row) => row.run_type !== "abort");
  const system = primarySystem(redAir);
  const group = primaryGroup(redAir);
  const profile = redAir.find((row) => row.interceptor_profile)?.interceptor_profile || {};
  const mops = deriveMops(rows, day, profile);
  const benchmarks = resolveBenchmarks(benchmarkRows, system.interceptorId, group);
  const compliance = buildCompliance(mops, day, profile, benchmarks);
  return {
    criteria: CRITERIA,
    mops,
    compliance,
    summary: summarizeCompliance(compliance),
    system,
    uasGroup: group,
    timezone: config.timezone,
  };
}

/** @param {import("pg").Pool} pool */
export function createCriteriaRouter(pool, config) {
  const router = express.Router();

  router.get("/criteria/catalog", requireRole("scorer"), (_req, res) => {
    return res.json({
      success: true,
      criteria: CRITERIA,
      killChain: KILL_CHAIN,
      catalog: KPP_CATALOG,
      categories: catalogByCategory(),
      groups: GROUP_KINEMATICS,
      narrativeMops: NARRATIVE_MOP_KEYS,
    });
  });

  router.get("/criteria/benchmarks", requireRole("scorer"), async (_req, res) => {
    try {
      const result = await pool.query("SELECT * FROM benchmarks ORDER BY kpp_id ASC");
      return res.json({ success: true, benchmarks: result.rows.map(benchmarkToApi) });
    } catch (error) {
      console.error("Load benchmarks failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load benchmarks." });
    }
  });

  router.put("/criteria/benchmarks", requireRole("admin"), async (req, res) => {
    const payload = parseBenchmark(req.body);
    if (!payload) {
      return res.status(400).json({ success: false, error: "A known KPP id is required." });
    }
    try {
      await pool.query(
        `INSERT INTO benchmarks (interceptor_id, kpp_id, uas_group, threshold, objective, unit, basis)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (COALESCE(interceptor_id, 0), kpp_id, uas_group)
         DO UPDATE SET threshold=EXCLUDED.threshold, objective=EXCLUDED.objective,
           unit=EXCLUDED.unit, basis=EXCLUDED.basis, updated_at=now()`,
        [payload.interceptorId, payload.kppId, payload.uasGroup, payload.threshold, payload.objective, payload.unit, payload.basis]
      );
      return res.json({ success: true });
    } catch (error) {
      console.error("Save benchmark failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save the benchmark." });
    }
  });

  router.delete("/criteria/benchmarks/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM benchmarks WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Benchmark not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete benchmark failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to delete the benchmark." });
    }
  });

  router.post("/criteria/benchmarks/derive", requireRole("admin"), (req, res) => {
    const params = parseDerivation(req.body);
    if (!params) {
      return res.status(400).json({
        success: false,
        error: "UAS group, standoff, engagement cycle, and launch-to-defeat time are required.",
      });
    }
    return res.json({ success: true, derived: deriveBenchmarks(params) });
  });

  router.put("/interceptors/:id/profile", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const profile = asProfile(req.body?.profile, isProfileKey);
      const result = await pool.query("UPDATE interceptors SET profile=$1 WHERE id=$2", [
        JSON.stringify(profile),
        id,
      ]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Interceptor not found." });
      }
      return res.json({ success: true, profile });
    } catch (error) {
      console.error("Save profile failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save the system profile." });
    }
  });

  router.put("/days/:id/metrics", requireRole("scorer"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    const metrics = parseDayMetrics(req.body);
    try {
      const result = await pool.query(
        `UPDATE days SET false_alarms=$1, operating_minutes=$2, system_aborts=$3,
           repair_minutes=$4, operate_crew=$5, setup_crew=$6, setup_minutes=$7, sensor_source=$8
         WHERE id=$9`,
        [
          metrics.falseAlarms,
          metrics.operatingMinutes,
          metrics.systemAborts,
          metrics.repairMinutes,
          metrics.operateCrew,
          metrics.setupCrew,
          metrics.setupMinutes,
          metrics.sensorSource,
          id,
        ]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Day not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Save day metrics failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save day metrics." });
    }
  });

  router.get("/days/:id/criteria", requireRole("scorer"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const review = await buildReview(pool, config, id);
      if (review === null) {
        return res.status(404).json({ success: false, error: "Day not found." });
      }
      return res.json({ success: true, ...review });
    } catch (error) {
      console.error("Build criteria review failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to build the criteria review." });
    }
  });

  router.get("/test-profiles", requireRole("scorer"), async (_req, res) => {
    try {
      return res.json({ success: true, profiles: await loadTestProfiles(pool) });
    } catch (error) {
      console.error("Load test profiles failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the test matrix." });
    }
  });

  router.post("/test-profiles", requireRole("admin"), async (req, res) => {
    const payload = parseTestProfile(req.body);
    if (!payload) {
      return res.status(400).json({ success: false, error: "A profile code is required." });
    }
    try {
      const id = await saveTestProfile(pool, null, payload);
      return res.json({ success: true, id });
    } catch (error) {
      if (error?.code === UNIQUE_VIOLATION) {
        return res.status(409).json({ success: false, error: "That profile code already exists." });
      }
      console.error("Create test profile failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save the profile." });
    }
  });

  router.put("/test-profiles/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    const payload = parseTestProfile(req.body);
    if (!id || !payload) {
      return res.status(400).json({ success: false, error: "Valid id and profile code are required." });
    }
    try {
      const saved = await saveTestProfile(pool, id, payload);
      if (saved === null) {
        return res.status(404).json({ success: false, error: "Profile not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      if (error?.code === UNIQUE_VIOLATION) {
        return res.status(409).json({ success: false, error: "That profile code already exists." });
      }
      console.error("Update test profile failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to save the profile." });
    }
  });

  router.delete("/test-profiles/:id", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("DELETE FROM test_profiles WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Profile not found." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete test profile failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to delete the profile." });
    }
  });

  return router;
}
