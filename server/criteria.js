/**
 * C-sUAS Capability Characterization Criteria: section 4.1, Criteria 1
 * through 5, their Measures of Effectiveness, and their Measures of
 * Performance. The structure is data; the derivation below is pure.
 *
 * The design rule here is that a scorer is never asked for something the
 * application can work out. Every MOP is tagged with how it is obtained:
 *
 *   derived      computed from logged runs, no scorer input at all
 *   run          computed from an optional per-run advanced measure
 *   day          computed from operational-day closeout counters
 *   qualitative  a narrative answer stored on the system profile
 *
 * The kill chain is the mechanism that makes the derived group possible.
 * Detect, track, classify, identify, engage, and defeat are ordered, so
 * one tap recording the furthest stage a run reached implies the outcome
 * of every earlier stage. That single field yields MOP 1.1.1, 1.2.1,
 * 2.1.1, 2.1.2, 3.1.1, and 3.1.2 at once.
 */

/** Ordered kill chain. Index order is the whole point; do not reorder. */
export const KILL_CHAIN = Object.freeze([
  { key: "none", label: "No Detect", hint: "Target flew, never seen" },
  { key: "detect", label: "Detect", hint: "Seen, no stable track" },
  { key: "track", label: "Track", hint: "Tracked, not classified" },
  { key: "classify", label: "Classify", hint: "Known to be a sUAS" },
  { key: "identify", label: "Identify", hint: "Type or model known" },
  { key: "engage", label: "Engage", hint: "Engaged, not defeated" },
  { key: "defeat", label: "Defeat", hint: "Threat neutralized" },
]);

const STAGE_KEYS = Object.freeze(KILL_CHAIN.map((stage) => stage.key));

/**
 * Stage inferred for a run logged before stage capture existed, or by a
 * scorer who used the fast path. A success reached defeat, a miss reached
 * engage, and a no-attempt reached identify without an engagement. Under
 * this mapping the derived Pk equals the outcome-based Pk the application
 * already reports, so no historical number moves.
 */
const INFERRED_STAGE = Object.freeze({
  success: "defeat",
  unsuccessful: "engage",
  not_attempted: "identify",
});

/**
 * @param {string} key
 * @returns {number} Position in the kill chain, or -1 when unknown.
 */
export function stageIndex(key) {
  return STAGE_KEYS.indexOf(key);
}

/** @returns {boolean} True when the value names a kill chain stage. */
export function isStageKey(value) {
  return typeof value === "string" && STAGE_KEYS.includes(value);
}

/**
 * @param {object} row Engagement row.
 * @returns {{ key: string, index: number, inferred: boolean }}
 */
export function effectiveStage(row) {
  if (isStageKey(row.stage_reached)) {
    return { key: row.stage_reached, index: stageIndex(row.stage_reached), inferred: false };
  }
  const key = INFERRED_STAGE[row.outcome] || "identify";
  return { key, index: stageIndex(key), inferred: true };
}

/** @returns {number | null} Ratio to two decimals, or null with no denominator. */
function ratio(numerator, denominator) {
  if (denominator === 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 100) / 100;
}

/** @returns {number[]} Finite numbers pulled from a column across rows. */
function column(rows, key) {
  return rows
    .map((row) => Number.parseFloat(row[key]))
    .filter((value) => Number.isFinite(value));
}

/** @returns {object | null} Mean, min, and max of a numeric column. */
function distribution(rows, key) {
  const values = column(rows, key);
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    mean: Math.round((total / values.length) * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
    n: values.length,
  };
}

/**
 * Basis string for a proportion derived from stage data, so a reader can
 * tell a measured number from one back-filled out of the outcome field.
 * @param {object[]} rows
 * @returns {string}
 */
function basisOf(rows) {
  if (rows.length === 0) {
    return "no data";
  }
  const inferred = rows.filter((row) => effectiveStage(row).inferred).length;
  if (inferred === 0) {
    return "captured";
  }
  if (inferred === rows.length) {
    return "inferred from outcome";
  }
  return `mixed: ${rows.length - inferred} captured, ${inferred} inferred`;
}

/** @returns {object} One MOP result record. */
function mop(id, name, value, units, denominator, rows, extra) {
  return {
    id,
    name,
    value,
    units,
    n: denominator,
    basis: basisOf(rows),
    ...(extra || {}),
  };
}

/** @returns {object[]} Rows at or beyond a kill chain stage. */
function atOrBeyond(rows, key) {
  const threshold = stageIndex(key);
  return rows.filter((row) => effectiveStage(row).index >= threshold);
}

/**
 * MOP 1.1.3 asks for slant range, which is the hypotenuse of the ground
 * range and the detection altitude. Both are already captured, so the
 * scorer is not asked for a third number.
 * @param {object[]} rows
 * @returns {object[]} Rows carrying a computed slant range.
 */
function withSlantRange(rows) {
  return rows.map((row) => {
    const ground = Number.parseFloat(row.detect_range_m);
    const height = Number.parseFloat(row.detect_alt_m);
    if (!Number.isFinite(ground) || !Number.isFinite(height)) {
      return row;
    }
    return { ...row, detect_slant_m: Math.round(Math.hypot(ground, height)) };
  });
}

/** @returns {number | null} False alarms per operating hour. */
function falseAlarmRate(day) {
  const hours = Number.parseFloat(day?.operating_minutes) / 60;
  const alarms = Number.parseInt(day?.false_alarms, 10);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(alarms)) {
    return null;
  }
  return Math.round((alarms / hours) * 100) / 100;
}

/** @returns {object[]} Criterion 1 MOP results. */
function deriveCriterion1(rows, day) {
  const detected = withSlantRange(atOrBeyond(rows, "detect"));
  const tracked = atOrBeyond(rows, "track");
  const far = falseAlarmRate(day);
  return [
    mop("1.1.1", "Probability of Detection", ratio(detected.length, rows.length), "", rows.length, rows),
    mop("1.1.2", "Detection Range (ground)", distribution(detected, "detect_range_m"), "m", detected.length, detected),
    mop("1.1.3", "Detection Range (slant)", distribution(detected, "detect_slant_m"), "m", detected.length, detected),
    mop("1.1.3a", "Detection Altitude", distribution(detected, "detect_alt_m"), "m AGL", detected.length, detected),
    { id: "1.1.4", name: "False Alarm Rate", value: far, units: "per hour", n: Number.parseInt(day?.false_alarms, 10) || 0, basis: far === null ? "day closeout not entered" : "day closeout" },
    mop("1.2.1", "Probability of Track", ratio(tracked.length, detected.length), "", detected.length, detected),
    mop("1.2.2", "Track Continuity", distribution(tracked, "track_continuity_pct"), "%", tracked.length, tracked),
    mop("1.2.3", "Track Accuracy", distribution(tracked, "track_error_m"), "m", tracked.length, tracked),
  ];
}

/** @returns {object[]} Criterion 2 MOP results. */
function deriveCriterion2(rows) {
  const tracked = atOrBeyond(rows, "track");
  const classified = atOrBeyond(rows, "classify");
  const identified = atOrBeyond(rows, "identify");
  const misIdentified = identified.filter((row) => row.identified_ok === false);
  const correctlyIdentified = identified.length - misIdentified.length;
  return [
    mop("2.1.1", "Probability of Correct Classification", ratio(classified.length, tracked.length), "", tracked.length, tracked),
    mop("2.1.2", "Probability of Correct Identification", ratio(correctlyIdentified, classified.length), "", classified.length, classified),
    mop("2.1.3", "Identification Range", distribution(identified, "id_range_m"), "m", identified.length, identified),
    mop("2.1.3t", "Identification Time", distribution(identified, "id_time_s"), "s", identified.length, identified),
    mop("2.1.4", "Mis-Identification Rate", ratio(misIdentified.length, identified.length), "", identified.length, identified),
  ];
}

/** @returns {object[]} Criterion 3 MOP results. */
function deriveCriterion3(rows) {
  const identified = atOrBeyond(rows, "identify");
  const engaged = atOrBeyond(rows, "engage");
  const defeated = atOrBeyond(rows, "defeat");
  return [
    mop("3.1.1", "Probability of Engagement", ratio(engaged.length, identified.length), "", identified.length, identified),
    mop("3.1.2", "Probability of Kill / Defeat (Pk)", ratio(defeated.length, engaged.length), "", engaged.length, engaged),
    mop("3.1.3", "Defeat Range", distribution(defeated, "engagement_range_m"), "m", defeated.length, defeated),
    mop("3.1.4", "Defeat Engagement Time", distribution(defeated, "time_to_intercept_s"), "s", defeated.length, defeated),
  ];
}

/** @returns {number | null} Quotient rounded to one decimal, or null. */
function quotient(numerator, denominator) {
  const top = Number.parseFloat(numerator);
  const bottom = Number.parseInt(denominator, 10);
  if (!Number.isFinite(top) || !Number.isInteger(bottom) || bottom <= 0) {
    return null;
  }
  return Math.round((top / bottom) * 10) / 10;
}

/** @returns {object[]} Criterion 4 MOP results from day closeout counters. */
function deriveCriterion4(day, profile) {
  const mtbsa = quotient(day?.operating_minutes, day?.system_aborts);
  const mttr = quotient(day?.repair_minutes, day?.system_aborts);
  return [
    { id: "4.1.1", name: "Impact on Co-located Systems", value: profile?.["mop.4.1.1"] || null, units: "narrative", n: 0, basis: "system profile" },
    { id: "4.1.2", name: "Impact to Ordnance, Personnel, Fuel (HERO/HERP/HERF)", value: profile?.["mop.4.1.2"] || null, units: "narrative", n: 0, basis: "system profile" },
    { id: "4.2.1", name: "Mean Time Between System Abort", value: mtbsa, units: "min", n: Number.parseInt(day?.system_aborts, 10) || 0, basis: mtbsa === null ? "day closeout not entered" : "day closeout" },
    { id: "4.2.2", name: "Mean Time to Repair", value: mttr, units: "min", n: Number.parseInt(day?.system_aborts, 10) || 0, basis: mttr === null ? "day closeout not entered" : "day closeout" },
  ];
}

/** @returns {object[]} Criterion 5 MOP results from the system profile. */
function deriveCriterion5(profile) {
  const entries = [
    ["5.1.1", "Risk Management Framework Compliance (ATO / ATC)"],
    ["5.2.1", "Contested Environment Operation (threat EW)"],
    ["5.3.1", "Hazard Prevention"],
    ["5.3.2", "Collateral Damage Mitigation"],
  ];
  return entries.map(([id, name]) => ({
    id,
    name,
    value: profile?.[`mop.${id}`] || null,
    units: "narrative",
    n: 0,
    basis: profile?.[`mop.${id}`] ? "system profile" : "system profile not entered",
  }));
}

/** Criteria headings, used by the report and the review screen. */
export const CRITERIA = Object.freeze([
  { id: "1", name: "Detection & Tracking", moes: ["MOE 1.1 UAS Detection", "MOE 1.2 UAS Tracking"] },
  { id: "2", name: "Classification & Identification", moes: ["MOE 2.1 Target Classification & Identification"] },
  { id: "3", name: "Threat Defeat & Denial", moes: ["MOE 3.1 Threat Engagement & Defeat"] },
  { id: "4", name: "System Interoperability & Reliability", moes: ["MOE 4.1 Electromagnetic Compatibility", "MOE 4.2 System Reliability & Maintainability"] },
  { id: "5", name: "Operational Viability", moes: ["MOE 5.1 Cybersecurity", "MOE 5.2 Environmental Survivability", "MOE 5.3 System Safety"] },
]);

/**
 * Derives every MOP in section 4.1 for one operational day.
 *
 * Abort runs are excluded. An abort run tests the terminate command, not
 * the kill chain, so counting it as a failure to detect or defeat would
 * understate the system twice over.
 *
 * @param {object[]} engagements Rows joined with drone and interceptor names.
 * @param {object} day Day row carrying the closeout counters.
 * @param {object} profile System profile answers keyed by KPP or MOP id.
 * @returns {{ criterion: string, results: object[] }[]}
 */
export function deriveMops(engagements, day, profile) {
  const rows = engagements.filter((row) => row.run_type !== "abort");
  return [
    { criterion: "1", results: deriveCriterion1(rows, day) },
    { criterion: "2", results: deriveCriterion2(rows) },
    { criterion: "3", results: deriveCriterion3(rows) },
    { criterion: "4", results: deriveCriterion4(day, profile) },
    { criterion: "5", results: deriveCriterion5(profile) },
  ];
}

/** @returns {object[]} Every MOP result flattened out of the criteria groups. */
export function flattenMops(groups) {
  return groups.flatMap((group) => group.results);
}
