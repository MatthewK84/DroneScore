/**
 * Timeline-budget benchmark profile.
 *
 * Derives Threshold and Objective presets from an Engagement Timeline
 * Analysis budget (C4 section 5): a detect-to-defeat time allowance, a
 * design threat speed, and a defended standoff. It sits beside the
 * group-ceiling derivation in thresholds.js and does not replace it.
 *
 * Pairing rule. A faster kill chain needs less detection range, so sizing
 * both levels against one threat would make the Objective range shorter
 * than the Threshold range. This profile sizes the Threshold timeline
 * against the MLCOA threat and the Objective timeline against the MDCOA
 * threat, so the Objective stays the harder requirement on every row.
 *
 * Honesty rule, carried over from thresholds.js. Rows whose source is
 * "judgment" are analyst recommendations, not values from an
 * authoritative source. The resolver labels them so the UI can keep them
 * out of any bulk "apply derived" action.
 */

import { groupKinematics } from "./thresholds.js";
import { TIMELINE_PRESETS } from "./timeline-presets.js";

const METRES_PER_MPH_SECOND = 0.44704;
const FEET_PER_METRE = 3.28084;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const ELEVATION_STEP_DEG = 5;
const PHASE_KEYS = Object.freeze(["track", "classify", "identify", "decide", "effect", "assess"]);
const LEVELS = Object.freeze(["threshold", "objective"]);

/**
 * @typedef {object} PhaseBudget Seconds allotted to each kill chain step.
 * @property {number} track
 * @property {number} classify
 * @property {number} identify
 * @property {number} decide
 * @property {number} effect
 * @property {number} assess
 */

/**
 * @typedef {object} LevelParams
 * @property {number} timelineS Detect-to-defeat budget, seconds.
 * @property {number} designSpeedMph Design threat closing speed.
 * @property {string} designThreat Label for the design threat.
 * @property {string} uasGroup DoD UAS group of the design threat.
 * @property {PhaseBudget} phases Split of timelineS; must sum to it.
 * @property {number} simultaneousTargets Raid size the level must handle.
 * @property {number} sequentialTargetsPerEffector Targets one effector
 *   must service inside the effect phase.
 * @property {number} noAbortProbability Required chance of no system
 *   abort across missionHours.
 * @property {number} costExchangeRatio Allowed cost per engagement as a
 *   multiple of threat unit cost.
 */

/**
 * @typedef {object} TimelineParams
 * @property {number} standoffM Defeat must complete outside this distance.
 * @property {number} missionHours Mission length for the reliability row.
 * @property {number} shotsPerTarget Engagements budgeted per target.
 * @property {number} maxTrackMoveM Largest target movement allowed
 *   between track updates.
 * @property {number | null} threatUnitCostUsd Unit cost of the design
 *   threat; null leaves the cost row unpopulated.
 * @property {LevelParams} threshold
 * @property {LevelParams} objective
 */

/** The 60 s Objective / 180 s Threshold profile from the C4 analysis. */
export const C4_ETA_60_180 = Object.freeze({
  standoffM: 1000,
  missionHours: 24,
  shotsPerTarget: 2,
  maxTrackMoveM: 15,
  threatUnitCostUsd: null,
  threshold: Object.freeze({
    timelineS: 180,
    designSpeedMph: 30,
    designThreat: "MLCOA single Group 1 multirotor",
    uasGroup: "1",
    phases: Object.freeze({ track: 15, classify: 20, identify: 30, decide: 45, effect: 60, assess: 10 }),
    simultaneousTargets: 3,
    sequentialTargetsPerEffector: 3,
    noAbortProbability: 0.8,
    costExchangeRatio: 10,
  }),
  objective: Object.freeze({
    timelineS: 60,
    designSpeedMph: 125,
    designThreat: "MDCOA Group 2 fixed-wing",
    uasGroup: "2",
    phases: Object.freeze({ track: 5, classify: 5, identify: 10, decide: 10, effect: 25, assess: 5 }),
    simultaneousTargets: 10,
    sequentialTargetsPerEffector: 6,
    noAbortProbability: 0.95,
    costExchangeRatio: 1,
  }),
});

/** @returns {number} Value rounded to two decimals. */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/** @returns {number} Design threat speed in metres per second. */
function speedMs(level) {
  return level.designSpeedMph * METRES_PER_MPH_SECOND;
}

/**
 * @param {LevelParams} level
 * @param {string} milestone "detect" or a PHASE_KEYS entry.
 * @returns {number} Seconds elapsed since detection when the milestone ends.
 */
function elapsedAt(level, milestone) {
  if (milestone === "detect") {
    return 0;
  }
  const end = PHASE_KEYS.indexOf(milestone) + 1;
  return PHASE_KEYS.slice(0, end).reduce((sum, key) => sum + level.phases[key], 0);
}

/** @returns {number} Metres from the asset when the milestone completes. */
function rangeMetres(params, level, milestone) {
  const remainingS = level.timelineS - elapsedAt(level, milestone);
  return params.standoffM + speedMs(level) * remainingS;
}

/** @returns {number} Required range in km when the milestone completes. */
function rangeKm(params, level, milestone) {
  return round2(rangeMetres(params, level, milestone) / 1000);
}

/** @returns {number | null} Group altitude ceiling in metres, or null. */
function ceilingMetres(level) {
  const band = groupKinematics(level.uasGroup);
  if (band === null || band.maxAltitudeFt === null) {
    return null;
  }
  return Math.round(band.maxAltitudeFt / FEET_PER_METRE);
}

/** @returns {number | null} Elevation needed to see the ceiling at defeat. */
function elevationDeg(params, level) {
  const ceiling = ceilingMetres(level);
  if (ceiling === null) {
    return null;
  }
  const defeatM = rangeMetres(params, level, "effect");
  const degrees = (Math.atan2(ceiling, defeatM) * 180) / Math.PI;
  return Math.ceil(degrees / ELEVATION_STEP_DEG) * ELEVATION_STEP_DEG;
}

/** @returns {number} Engagements per hour one channel must sustain. */
function perHour(level) {
  return Math.floor(SECONDS_PER_HOUR / level.timelineS);
}

/** @returns {number} Minimum MTBSA in hours for the no-abort probability. */
function mtbsaHours(params, level) {
  return Math.ceil(-params.missionHours / Math.log(level.noAbortProbability));
}

/** @returns {number | null} Cost ceiling, or null when threat cost is unset. */
function costCeiling(params, level) {
  if (params.threatUnitCostUsd === null) {
    return null;
  }
  return Math.round(params.threatUnitCostUsd * level.costExchangeRatio);
}

/** @returns {number} Engagements per minute one effector must sustain. */
function engagementsPerMinute(level) {
  const perSecond = level.sequentialTargetsPerEffector / level.phases.effect;
  return Math.ceil(perSecond * SECONDS_PER_MINUTE);
}

/**
 * Derivation table. Each key maps to a pure function of (params, level).
 * The preset catalog names a key; nothing here is evaluated from a string.
 */
const COMPUTE = Object.freeze({
  "range:detect": (p, l) => rangeKm(p, l, "detect"),
  "range:track": (p, l) => rangeKm(p, l, "track"),
  "range:classify": (p, l) => rangeKm(p, l, "classify"),
  "range:identify": (p, l) => rangeKm(p, l, "identify"),
  "range:engage": (p, l) => rangeKm(p, l, "decide"),
  "altitude:groupCeiling": (_p, l) => ceilingMetres(l),
  "angle:elevationAtDefeat": (p, l) => elevationDeg(p, l),
  "rate:updateHz": (p, l) => Math.ceil(speedMs(l) / p.maxTrackMoveM),
  "count:simultaneous": (_p, l) => l.simultaneousTargets,
  "throughput:perHour": (_p, l) => perHour(l),
  "capacity:launcher": (p, l) => l.simultaneousTargets * p.shotsPerTarget,
  "rate:engagementsPerMinute": (_p, l) => engagementsPerMinute(l),
  "time:cycleSeconds": (_p, l) => Math.floor(SECONDS_PER_HOUR / perHour(l)),
  "speed:designThreat": (_p, l) => Math.round(speedMs(l) * 10) / 10,
  "reliability:mtbsaHours": (p, l) => mtbsaHours(p, l),
  "cost:exchange": (p, l) => costCeiling(p, l),
  "time:effectPhase": (_p, l) => l.phases.effect,
});

/** @returns {string} One-line summary of a level for basis sentences. */
function levelSummary(params, level, name) {
  return (
    `${name}: ${level.timelineS} s budget vs ${level.designThreat} at ` +
    `${level.designSpeedMph} mph, ${params.standoffM} m standoff`
  );
}

/** @returns {string} Basis text for a derived row, covering both levels. */
function derivedBasis(params, entry, values) {
  const t = levelSummary(params, params.threshold, "Threshold");
  const o = levelSummary(params, params.objective, "Objective");
  return (
    `Derived (${entry.derivation}). ${entry.basis} ${t} gives ${values.threshold}. ` +
    `${o} gives ${values.objective}.`
  );
}

/** @returns {string[]} Errors for one level; empty when valid. */
function validateLevel(level, name) {
  const errors = [];
  const positive = ["timelineS", "designSpeedMph", "simultaneousTargets", "sequentialTargetsPerEffector"];
  for (const key of positive) {
    if (!Number.isFinite(level?.[key]) || level[key] <= 0) {
      errors.push(`${name}.${key} must be a positive number.`);
    }
  }
  const phaseSum = PHASE_KEYS.reduce((sum, key) => sum + (Number(level?.phases?.[key]) || 0), 0);
  if (phaseSum !== level?.timelineS) {
    errors.push(`${name} phases sum to ${phaseSum} s but the timeline is ${level?.timelineS} s.`);
  }
  const p = level?.noAbortProbability;
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    errors.push(`${name}.noAbortProbability must be between 0 and 1, exclusive.`);
  }
  return errors;
}

/**
 * @param {TimelineParams} params
 * @returns {string[]} Every validation error; empty when params are usable.
 */
export function validateTimelineParams(params) {
  const errors = [...validateLevel(params?.threshold, "threshold"), ...validateLevel(params?.objective, "objective")];
  const shared = ["standoffM", "missionHours", "shotsPerTarget", "maxTrackMoveM"];
  for (const key of shared) {
    if (!Number.isFinite(params?.[key]) || params[key] <= 0) {
      errors.push(`${key} must be a positive number.`);
    }
  }
  const cost = params?.threatUnitCostUsd;
  if (cost !== null && (!Number.isFinite(cost) || cost <= 0)) {
    errors.push("threatUnitCostUsd must be a positive number or null.");
  }
  if (params?.objective?.timelineS >= params?.threshold?.timelineS) {
    errors.push("The Objective timeline must be shorter than the Threshold timeline.");
  }
  return errors;
}

/** @returns {object} Threshold and Objective for a derived row. */
function computeDerived(params, entry) {
  const compute = COMPUTE[entry.derivation];
  if (compute === undefined) {
    return { threshold: null, objective: null };
  }
  const values = {};
  for (const level of LEVELS) {
    values[level] = compute(params, params[level]);
  }
  return values;
}

/** @returns {object} One resolved preset row. */
function resolveEntry(params, entry, payloadTypes) {
  const applicable = entry.payload === null || payloadTypes.includes(entry.payload);
  const base = {
    id: entry.id,
    section: entry.section,
    measure: entry.measure,
    units: entry.units,
    input: entry.input,
    direction: entry.direction,
    source: entry.source,
    applicable,
  };
  if (entry.source !== "derived") {
    return { ...base, threshold: entry.threshold, objective: entry.objective, basis: entry.basis };
  }
  const values = computeDerived(params, entry);
  const populated = values.threshold !== null && values.objective !== null;
  const basis = populated ? derivedBasis(params, entry, values) : `Not populated. ${entry.basis}`;
  return { ...base, ...values, basis };
}

/**
 * Resolves every preset row for a parameter set.
 *
 * @param {TimelineParams} params
 * @param {string[]} payloadTypes Defeat payloads of the system under test,
 *   drawn from PAYLOAD_TYPES in timeline-presets.js.
 * @returns {{ ok: true, rows: object[] } | { ok: false, errors: string[] }}
 */
export function resolveTimelinePresets(params, payloadTypes) {
  const errors = validateTimelineParams(params);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const payloads = Array.isArray(payloadTypes) ? payloadTypes : [];
  const rows = TIMELINE_PRESETS.map((entry) => resolveEntry(params, entry, payloads));
  return { ok: true, rows };
}

/**
 * Kill chain milestones with elapsed time and range remaining, for the
 * timeline strip the UI draws above the preset list.
 *
 * @param {TimelineParams} params
 * @returns {object[]} One record per milestone and level.
 */
export function timelineMilestones(params) {
  const milestones = ["detect", ...PHASE_KEYS];
  return milestones.flatMap((milestone) =>
    LEVELS.map((level) => ({
      milestone,
      level,
      elapsedS: elapsedAt(params[level], milestone),
      rangeKm: rangeKm(params, params[level], milestone),
    }))
  );
}
