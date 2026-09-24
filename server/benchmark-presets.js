import { assessedOnly } from "./not-assessable.js";
import { GROUP_KINEMATICS } from "./thresholds.js";
import { PAYLOAD_TYPES, TIMELINE_PRESETS } from "./timeline-presets.js";
import { resolveTimelinePresets, timelineMilestones, validateTimelineParams } from "./timeline-profile.js";
import { asId, asOptionalNumber, asText } from "./validate.js";

/**
 * Glue between the timeline-budget preset profile and the benchmarks table.
 *
 * The profile in timeline-profile.js resolves Threshold and Objective
 * presets. This module validates the request that feeds it, converts each
 * preset into the storage encoding the scorer reads, stamps the basis that
 * serves as the audit record, and plans an all-or-nothing bulk write.
 * Everything here is pure, so the route only wraps it in a transaction.
 */

/** Items one bulk write may carry. */
export const MAX_BULK_ITEMS = 150;

const STAMP_LABEL = "C4 ETA 60/180 preset";
const STAMP_PATTERN = /^\[C4 ETA 60\/180 preset: [^\]]*\]\s*/;
const BASIS_MAX = 2000;
const PHASE_KEYS = Object.freeze(["track", "classify", "identify", "decide", "effect", "assess"]);
const UAS_GROUPS = Object.freeze(GROUP_KINEMATICS.map((band) => band.group));
const PRESET_BY_ID = new Map(TIMELINE_PRESETS.map((entry) => [entry.id, entry]));
const YES_NO_CODES = Object.freeze({ required: 1, not_required: 0 });

/**
 * Rows the day closeout scores in a different unit than the profile
 * derives. MOP 4.2.1 reports mean time between system abort in minutes,
 * and the profile computes 8.4 in hours.
 */
const STORAGE_CONVERSIONS = Object.freeze({
  "8.4": Object.freeze({
    factor: 60,
    unit: "min",
    note: "Stored in minutes (hours x 60) because MOP 4.2.1 reports MTBSA in minutes.",
  }),
});

/** Bounds for the shared parameters, as [min, max]. */
const SHARED_BOUNDS = Object.freeze({
  standoffM: [0, 200000],
  missionHours: [0, 10000],
  shotsPerTarget: [0, 100],
  maxTrackMoveM: [0, 100000],
});

/** Bounds for each level's numeric parameters, as [min, max]. */
const LEVEL_BOUNDS = Object.freeze({
  timelineS: [0, 3600],
  designSpeedMph: [0, 2000],
  simultaneousTargets: [0, 1000],
  sequentialTargetsPerEffector: [0, 1000],
  noAbortProbability: [0, 1],
  costExchangeRatio: [0, 1000000],
});

/** Bounds for each phase budget, in seconds. */
const PHASE_BOUNDS = Object.freeze(Object.fromEntries(PHASE_KEYS.map((key) => [key, [0, 3600]])));

/** @returns {boolean} True for a value the client left blank. */
function isBlank(value) {
  return value === null || value === undefined || value === "";
}

/**
 * @param {object} source Raw object holding the field.
 * @param {string} key Field name.
 * @param {number[]} bounds [min, max].
 * @param {string} label Name used in the error message.
 * @returns {{ value: number | null, error: string | null }}
 */
function readNumber(source, key, bounds, label) {
  const raw = source?.[key];
  const value = asOptionalNumber(raw, bounds[0], bounds[1]);
  const error = value === null && !isBlank(raw) ? `${label} must be a number from ${bounds[0]} to ${bounds[1]}.` : null;
  return { value, error };
}

/** @returns {{ values: object, errors: string[] }} Numbers read per bounds table. */
function readNumbers(source, bounds, prefix) {
  const values = {};
  const errors = [];
  for (const [key, range] of Object.entries(bounds)) {
    const read = readNumber(source, key, range, `${prefix}${key}`);
    values[key] = read.value;
    if (read.error !== null) {
      errors.push(read.error);
    }
  }
  return { values, errors };
}

/** @returns {{ level: object, errors: string[] }} One level, read from raw input. */
function readLevel(raw, name) {
  const numbers = readNumbers(raw, LEVEL_BOUNDS, `${name}.`);
  const phases = readNumbers(raw?.phases, PHASE_BOUNDS, `${name}.phases.`);
  const uasGroup = asText(raw?.uasGroup, 4);
  const errors = [...numbers.errors, ...phases.errors];
  if (!UAS_GROUPS.includes(uasGroup)) {
    errors.push(`${name}.uasGroup must be one of ${UAS_GROUPS.join(", ")}.`);
  }
  if (numbers.values.costExchangeRatio === null || numbers.values.costExchangeRatio <= 0) {
    errors.push(`${name}.costExchangeRatio must be a positive number.`);
  }
  const level = { ...numbers.values, designThreat: asText(raw?.designThreat, 120), uasGroup, phases: phases.values };
  return { level, errors };
}

/** @returns {{ payloadTypes: string[], errors: string[] }} Validated payload list. */
function readPayloads(raw) {
  if (!Array.isArray(raw)) {
    return { payloadTypes: [], errors: ["payloadTypes must be a list."] };
  }
  const unknown = raw.filter((value) => !PAYLOAD_TYPES.includes(value));
  const errors = unknown.map((value) => `Unknown payload type: ${String(value).slice(0, 40)}.`);
  return { payloadTypes: [...new Set(raw.filter((value) => PAYLOAD_TYPES.includes(value)))], errors };
}

/**
 * Validates a derive-timeline request body.
 *
 * @param {object} body Raw request body: { params, payloadTypes }.
 * @returns {{ ok: true, params: object, payloadTypes: string[] } | { ok: false, errors: string[] }}
 */
export function parseTimelineRequest(body) {
  const raw = body?.params;
  const shared = readNumbers(raw, SHARED_BOUNDS, "");
  const cost = readNumber(raw, "threatUnitCostUsd", [0, 1000000000], "threatUnitCostUsd");
  const threshold = readLevel(raw?.threshold, "threshold");
  const objective = readLevel(raw?.objective, "objective");
  const payloads = readPayloads(body?.payloadTypes);
  const params = { ...shared.values, threatUnitCostUsd: cost.value, threshold: threshold.level, objective: objective.level };
  const errors = [
    ...shared.errors,
    ...(cost.error === null ? [] : [cost.error]),
    ...threshold.errors,
    ...objective.errors,
    ...payloads.errors,
    ...validateTimelineParams(params),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, params, payloadTypes: payloads.payloadTypes };
}

/** @returns {object} A preset row with its display values in the scorer's unit. */
function convertUnits(row) {
  const conversion = STORAGE_CONVERSIONS[row.id];
  if (conversion === undefined || row.threshold === null || row.objective === null) {
    return row;
  }
  return {
    ...row,
    threshold: row.threshold * conversion.factor,
    objective: row.objective * conversion.factor,
    units: conversion.unit,
    basis: `${row.basis} ${conversion.note}`,
  };
}

/** @returns {number | null} A Y/N preset level as its stored 1 or 0. */
function encodeYesNo(level) {
  const code = YES_NO_CODES[level];
  return code === undefined ? null : code;
}

/**
 * @param {object} row A resolved, unit-converted preset row.
 * @returns {object | null} The values a write stores, or null when the row
 *   cannot be written: not covered, or a derived row left unpopulated.
 */
function storageFor(row) {
  if (row.source === "not_covered") {
    return null;
  }
  if (row.source === "requirement") {
    return { threshold: null, objective: null, unit: row.units, basis: row.basis };
  }
  if (row.input === "yesno") {
    return { threshold: encodeYesNo(row.threshold), objective: encodeYesNo(row.objective), unit: "Y/N", basis: row.basis };
  }
  if (row.threshold === null || row.objective === null) {
    return null;
  }
  return { threshold: row.threshold, objective: row.objective, unit: row.units, basis: row.basis };
}

/**
 * Resolves every preset for a validated request, in storage units, with
 * the values a write would store attached as `store`. Rows the evaluation
 * does not assess are left out, so no click can benchmark them.
 *
 * @param {object} params Validated TimelineParams.
 * @param {string[]} payloadTypes Validated payload types.
 * @returns {{ rows: object[], milestones: object[] }}
 */
export function buildTimelinePreview(params, payloadTypes) {
  const resolved = resolveTimelinePresets(params, payloadTypes);
  const rows = resolved.ok ? assessedOnly(resolved.rows).map(convertUnits) : [];
  return {
    rows: rows.map((row) => ({ ...row, store: storageFor(row) })),
    milestones: timelineMilestones(params),
  };
}

/**
 * Basis stamp that serves as the audit record for a preset write. Logins
 * are shared per role, so the stamp names the role that adopted the row.
 *
 * @param {string} source Preset source: derived, judgment, or requirement.
 * @param {string} role Session role of the writer.
 * @param {string} isoDate YYYY-MM-DD.
 * @returns {string}
 */
export function presetStamp(source, role, isoDate) {
  if (source === "derived") {
    return `[${STAMP_LABEL}: derived]`;
  }
  return `[${STAMP_LABEL}: ${source}, adopted by ${role} on ${isoDate}]`;
}

/** @returns {string} Basis text with any leading preset stamp removed. */
export function stripStamp(basis) {
  return String(basis || "").replace(STAMP_PATTERN, "");
}

/** @returns {string} Basis text carrying exactly one stamp. */
function stampBasis(basis, stamp) {
  const body = stripStamp(basis).slice(0, BASIS_MAX - stamp.length - 1);
  return body.length === 0 ? stamp : `${stamp} ${body}`;
}

/** @returns {string | null} Why an item cannot be written, or null. */
function presetError(kppId) {
  const preset = PRESET_BY_ID.get(kppId);
  if (preset === undefined) {
    return `${kppId} has no timeline preset.`;
  }
  return preset.source === "not_covered" ? `${kppId} is not covered by the timeline profile.` : null;
}

/** @returns {string | null} Why a raw number field is unusable, or null. */
function numberError(item, key, parsed) {
  return parsed === null && !isBlank(item?.[key]) ? `${item?.kppId}: ${key} must be a number.` : null;
}

/**
 * Validates and stamps one bulk item.
 *
 * @param {object} raw Raw item from the request.
 * @param {(body: object) => object | null} parseItem The benchmark parser
 *   the single-row route uses.
 * @param {{ role: string, isoDate: string }} actor
 * @returns {{ item: object | null, errors: string[] }}
 */
function readItem(raw, parseItem, actor) {
  const parsed = parseItem(raw);
  if (parsed === null) {
    return { item: null, errors: [`${String(raw?.kppId).slice(0, 20)} is not a known KPP or scorecard row.`] };
  }
  const errors = [
    presetError(parsed.kppId),
    numberError(raw, "threshold", parsed.threshold),
    numberError(raw, "objective", parsed.objective),
  ].filter((error) => error !== null);
  if (errors.length > 0) {
    return { item: null, errors };
  }
  const stamp = presetStamp(PRESET_BY_ID.get(parsed.kppId).source, actor.role, actor.isoDate);
  const item = { kppId: parsed.kppId, threshold: parsed.threshold, objective: parsed.objective, unit: parsed.unit };
  return { item: { ...item, basis: stampBasis(asText(raw?.basis, BASIS_MAX), stamp) }, errors: [] };
}

/** @returns {string[]} Errors about the shape of the items list. */
function listErrors(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return ["items must be a non-empty list."];
  }
  if (rawItems.length > MAX_BULK_ITEMS) {
    return [`items may hold at most ${MAX_BULK_ITEMS} rows.`];
  }
  const ids = rawItems.map((raw) => String(raw?.kppId));
  return new Set(ids).size === ids.length ? [] : ["Each row may appear only once per request."];
}

/** @returns {{ scope: object, errors: string[] }} The system and group a bulk write targets. */
function readScope(body) {
  const raw = body?.interceptorId;
  const interceptorId = asId(raw);
  const errors = interceptorId === null && !isBlank(raw) ? ["interceptorId must be a system id or null."] : [];
  return { scope: { interceptorId, uasGroup: asText(body?.uasGroup, 4) }, errors };
}

/**
 * Validates a bulk write request. One bad item rejects the whole request.
 *
 * @param {object} body Raw body: { interceptorId, uasGroup, confirmOverwrite, items }.
 * @param {(body: object) => object | null} parseItem Single-row benchmark parser.
 * @param {{ role: string, isoDate: string }} actor Writer role and today's date.
 * @returns {{ ok: true, request: object } | { ok: false, errors: string[] }}
 */
export function parseBulkRequest(body, parseItem, actor) {
  const shapeErrors = listErrors(body?.items);
  if (shapeErrors.length > 0) {
    return { ok: false, errors: shapeErrors };
  }
  const scope = readScope(body);
  const reads = body.items.map((raw) => readItem({ ...raw, ...scope.scope }, parseItem, actor));
  const errors = [...scope.errors, ...reads.flatMap((read) => read.errors)];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    request: {
      ...scope.scope,
      confirmOverwrite: body?.confirmOverwrite === true,
      items: reads.map((read) => read.item),
    },
  };
}

/** @returns {number | null} A stored NUMERIC as a number, or null. */
function asStoredNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

/** @returns {object} The comparable part of a stored benchmark row. */
function storedValues(row) {
  return {
    threshold: asStoredNumber(row.threshold),
    objective: asStoredNumber(row.objective),
    unit: row.unit || "",
    basis: row.basis || "",
  };
}

/**
 * @returns {boolean} True when two benchmarks agree on both limits, the
 *   unit, and the basis text once any preset stamp is set aside.
 */
export function sameBenchmark(a, b) {
  return (
    a.threshold === b.threshold &&
    a.objective === b.objective &&
    a.unit === b.unit &&
    stripStamp(a.basis) === stripStamp(b.basis)
  );
}

/**
 * Plans a bulk write against the rows already stored for the same scope.
 * An item equal to its stored row is left alone, so replaying a request
 * keeps the original adoption stamp. An item that would change a stored
 * row is a conflict the caller must confirm.
 *
 * @param {object[]} storedRows Stored benchmark rows for the scope.
 * @param {object[]} items Validated, stamped items.
 * @returns {{ writes: object[], conflicts: object[], unchanged: string[] }}
 */
export function planBulkWrite(storedRows, items) {
  const byId = new Map(storedRows.map((row) => [row.kpp_id, row]));
  const writes = [];
  const conflicts = [];
  const unchanged = [];
  for (const item of items) {
    const stored = byId.get(item.kppId);
    const current = stored === undefined ? null : storedValues(stored);
    if (current !== null && sameBenchmark(current, item)) {
      unchanged.push(item.kppId);
      continue;
    }
    if (current !== null) {
      conflicts.push({ kppId: item.kppId, current, next: { ...item } });
    }
    writes.push(item);
  }
  return { writes, conflicts, unchanged };
}
