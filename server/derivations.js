/**
 * The derivation engine: criteria computed, not asked for.
 *
 * Some criteria follow arithmetically from what a vendor declares and what
 * the runs demonstrate together: cost per engagement is a unit cost times
 * the interceptors expended, divided by the defeats. Asking anyone for such
 * a number invites a figure that disagrees with its own inputs, so the
 * engine computes it and shows the arithmetic.
 *
 * Two rules bound everything here.
 *
 *   Nothing is estimated. Every value is arithmetic on declared or
 *   demonstrated figures, and its basis string shows the sum in full. A
 *   derivation missing an input returns null and names the input.
 *
 *   No probability is ever produced from a specification. How often a
 *   system detects, locks, or kills is only ever demonstrated by runs; the
 *   engine compares a vendor's claim against that evidence, it never
 *   substitutes for it.
 */

import { effectiveStage, flattenMops, stageIndex } from "./criteria.js";
import { ceilingSpeedMs, GROUP_KINEMATICS } from "./thresholds.js";

/** @returns {number | null} A finite number parsed from a stored value. */
function num(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** @returns {string} A number for a sentence, thousands-separated. */
function fmt(value, digits = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** @returns {number} A value rounded to the given decimals. */
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** @returns {object[]} Intercept runs, aborts excluded. */
function redAir(rows) {
  return rows.filter((row) => row.run_type !== "abort");
}

/** @returns {object[]} Runs that reached at least the named kill chain stage. */
function reached(rows, stage) {
  const floor = stageIndex(stage);
  return redAir(rows).filter((row) => effectiveStage(row).index >= floor);
}

/** @returns {object} A derivation that could not be made, naming what it lacks. */
function missing(basis) {
  return { value: null, basis };
}

/**
 * KPP 9.1. The operative endurance of an interceptor is what it flies with
 * the payload it engages with; unloaded endurance is reported, not used.
 */
function batteryLife(profile) {
  const loaded = num(profile["in.flight_time_loaded"]);
  const unloaded = num(profile["in.flight_time_unloaded"]);
  if (loaded === null) {
    return missing("Needs the flight time with mission payload from the vendor data sheet.");
  }
  const warnings = [];
  let basis = `Flight time with mission payload, ${fmt(loaded)} min, from the vendor data sheet.`;
  if (unloaded !== null) {
    basis += ` Unloaded endurance of ${fmt(unloaded)} min is not the operative figure: an interceptor engages carrying its payload.`;
    if (loaded > unloaded) {
      warnings.push(`Loaded flight time (${fmt(loaded)} min) exceeds unloaded (${fmt(unloaded)} min); the sheet should be checked.`);
    }
  }
  return { value: loaded, basis, warnings };
}

/**
 * KPP 5.8. Interceptor expenditure per successful engagement: one
 * interceptor spent on every run that reached the engage stage, divided by
 * the runs that reached defeat.
 */
function costPerEngagement(profile, rows) {
  const unitCost = num(profile["9.6"]);
  if (unitCost === null) {
    return missing("Needs the cost of one interceptor (KPP 9.6) from the vendor data sheet.");
  }
  const engaged = reached(rows, "engage").length;
  const defeated = reached(rows, "defeat").length;
  if (defeated === 0) {
    return missing(`No successful engagement yet: ${engaged} engaged, none defeated. Cost per engagement is undefined until one succeeds.`);
  }
  const value = round((unitCost * engaged) / defeated, 2);
  return {
    value,
    basis:
      `$${fmt(unitCost, 2)} per interceptor x ${engaged} interceptors expended / ${defeated} defeats = $${fmt(value, 2)}. ` +
      "Counts interceptor expenditure only, one interceptor per engagement; labor and maintenance are not included.",
  };
}

/** @returns {number | null} Mean time to intercept across engaged runs, seconds. */
function meanEngagementTime(rows) {
  const times = reached(rows, "engage").map((row) => num(row.time_to_intercept_s)).filter((value) => value !== null);
  if (times.length === 0) {
    return null;
  }
  return times.reduce((sum, value) => sum + value, 0) / times.length;
}

/**
 * KPP 5.3. Sustained defeats an hour from one launcher, engaging one target
 * at a time: each cycle is the time to ready the next interceptor plus the
 * demonstrated engagement time, and only the demonstrated fraction of
 * engagements defeat their target.
 */
function quantityOverTime(profile, rows, mopsById) {
  const prep = num(profile["INT-11"]);
  const engagement = meanEngagementTime(rows);
  const pk = num(mopsById.get("3.1.2")?.value);
  if (prep === null) {
    return missing("Needs the time to ready the next interceptor (INT-11) from the vendor data sheet.");
  }
  if (engagement === null) {
    return missing("Needs logged times to intercept on engaged runs.");
  }
  if (pk === null) {
    return missing("Needs a demonstrated Pk (MOP 3.1.2) from runs that reached the engage stage.");
  }
  const perHour = 3600 / (prep + engagement);
  const value = round(perHour * pk, 1);
  return {
    value,
    basis:
      `3600 s / (${fmt(prep)} s to ready the next interceptor + ${fmt(engagement)} s mean engagement time) = ` +
      `${fmt(perHour)} engagements an hour, x demonstrated Pk ${fmt(pk, 2)} = ${fmt(value)} defeats an hour. ` +
      "One launcher engaging one target at a time; a full magazine at the start of the hour is not counted as surge.",
  };
}

/**
 * INT-3. The envelope as declared, checked against what the interceptor's
 * loaded endurance at cruise speed can actually cover one way.
 */
function interceptEnvelope(profile) {
  const range = num(profile["in.working_range"]);
  const ceiling = num(profile["in.max_altitude"]);
  if (range === null || ceiling === null) {
    return missing("Needs the working engagement range and maximum interceptor altitude from the vendor data sheet.");
  }
  const text = `${fmt(range)} km radius, to ${fmt(ceiling, 0)} m AGL`;
  const loaded = num(profile["in.flight_time_loaded"]);
  const cruise = num(profile["in.cruise_speed"]);
  if (loaded === null || cruise === null) {
    return { value: text, basis: `${text}, as declared. Not checked against endurance: needs loaded flight time and cruise speed.` };
  }
  const reach = round((loaded * 60 * cruise) / 1000, 1);
  if (reach >= range) {
    return {
      value: text,
      basis: `${text}, as declared. ${fmt(loaded)} min loaded at ${fmt(cruise)} m/s cruise covers ${fmt(reach)} km one way, which supports the ${fmt(range)} km working range.`,
    };
  }
  const warning = `${fmt(loaded)} min loaded at ${fmt(cruise)} m/s cruise covers only ${fmt(reach)} km one way, short of the ${fmt(range)} km working range declared.`;
  return { value: text, basis: `${text}, as declared. ${warning}`, warnings: [warning] };
}

/**
 * The interceptor's declared top speed against every UAS group's published
 * speed ceiling. Reported, not scored: it says which target groups the
 * interceptor can run down in a tail chase at all.
 *
 * @returns {object[]}
 */
export function speedAdvantage(profile) {
  const speed = num(profile["INT-1"]);
  if (speed === null) {
    return [];
  }
  return GROUP_KINEMATICS.map((band) => {
    const ceiling = ceilingSpeedMs(band);
    if (ceiling === null) {
      return { group: band.group, ceiling: null, margin: null, text: `Group ${band.group}: no published speed ceiling.` };
    }
    const margin = round(speed - ceiling, 1);
    const text =
      margin > 0
        ? `Group ${band.group} ceiling ${fmt(ceiling)} m/s: faster by ${fmt(margin)} m/s.`
        : `Group ${band.group} ceiling ${fmt(ceiling)} m/s: slower by ${fmt(-margin)} m/s, so it cannot close on a target flying away at the band ceiling.`;
    return { group: band.group, ceiling: round(ceiling, 1), margin, text };
  });
}

/**
 * Derives every criterion the engine computes.
 *
 * @param {object} profile System profile answers, airframe inputs included.
 * @param {object[]} rows One system's engagement rows.
 * @param {object[]} mopGroups Output of deriveMops for the same rows.
 * @returns {{ values: Map<string, object>, speed: object[] }} Derived value
 *   and basis per catalog id, and the speed comparison.
 */
export function deriveFromDeclarations(profile, rows, mopGroups) {
  const answers = profile || {};
  const mopsById = new Map(flattenMops(mopGroups).map((result) => [result.id, result]));
  const values = new Map([
    ["9.1", { measure: "Battery Life", units: "min", ...batteryLife(answers) }],
    ["5.8", { measure: "Cost per Engagement", units: "$", ...costPerEngagement(answers, rows) }],
    ["5.3", { measure: "Quantity (Over Time)", units: "#/hour", ...quantityOverTime(answers, rows, mopsById) }],
    ["INT-3", { measure: "Intercept Envelope", units: "km / m AGL", ...interceptEnvelope(answers) }],
  ]);
  return { values, speed: speedAdvantage(answers) };
}

// ---------------------------------------------------------------------------
// Declared against demonstrated
// ---------------------------------------------------------------------------

/**
 * Claims the runs can speak to. `from` reads the demonstrated figure off a
 * MOP; `scale` puts it in the claim's unit. `kind` decides what agreement
 * means: an ability claimed at a level is met when shown at or above it,
 * and a furthest range is only ever demonstrated up to what was flown.
 */
const COMPARABLE = Object.freeze([
  { id: "1.1", label: "KPP 1.1", measure: "Detection range", unit: "km", mop: "1.1.2", field: "mean", scale: 0.001, kind: "level" },
  { id: "1.2", label: "KPP 1.2", measure: "Probability of detection", unit: "%", mop: "1.1.1", field: "value", scale: 100, kind: "level" },
  { id: "3a.2", label: "KPP 3a.2", measure: "Classification accuracy", unit: "%", mop: "2.1.1", field: "value", scale: 100, kind: "level" },
  { id: "5.4e", label: "KPP 5.4e", measure: "Kinetic Pk", unit: "%", mop: "3.1.2", field: "value", scale: 100, kind: "level" },
  { id: "in.working_range", label: "Airframe", measure: "Working engagement range", unit: "km", mop: "3.1.3", field: "max", scale: 0.001, kind: "reach" },
]);

/** Claims no run captures, and what would be needed to test them. */
const UNTESTABLE = Object.freeze([
  { id: "INT-5", label: "INT-5", measure: "Probability of lock", unit: "%", note: "Runs do not record seeker lock, so this claim cannot be tested from the run log." },
  { id: "INT-6", label: "INT-6", measure: "Terminal guidance accuracy (CEP)", unit: "m", note: "Runs do not record miss distance, so this claim cannot be tested from the run log." },
  { id: "INT-13", label: "INT-13", measure: "Engagement geometry Pk", unit: "%", note: "Runs do not record engagement geometry, so this claim cannot be tested from the run log." },
]);

/** @returns {{ value: number | null, n: number }} A MOP's figure in the claim's unit. */
function demonstrated(mopsById, spec) {
  const result = mopsById.get(spec.mop);
  if (!result) {
    return { value: null, n: 0 };
  }
  const raw = spec.field === "value" ? result.value : result.value?.[spec.field];
  const parsed = num(raw);
  const n = result.value?.n ?? result.n ?? 0;
  return { value: parsed === null ? null : round(parsed * spec.scale, 2), n };
}

/** @returns {object} One comparison of a claim with the runs. */
function compare(spec, declared, mopsById, source) {
  const shown = demonstrated(mopsById, spec);
  const base = {
    id: spec.id,
    label: spec.label,
    measure: spec.measure,
    unit: spec.unit,
    declared,
    demonstrated: shown.value,
    n: shown.n,
    source,
  };
  if (shown.value === null) {
    return { ...base, status: "untested", note: "No run has produced this measure yet." };
  }
  if (shown.value >= declared) {
    return { ...base, status: "consistent", note: spec.kind === "reach" ? "Demonstrated out to the declared range." : "Demonstrated at or above the declared level." };
  }
  const gap = round(declared - shown.value, 2);
  const note =
    spec.kind === "reach"
      ? `Furthest defeat so far is ${fmt(gap, 2)} ${spec.unit} short of the declared range; not yet flown that far, not shown to fail.`
      : `Demonstrated ${fmt(gap, 2)} ${spec.unit} below the declared level.`;
  return { ...base, status: "shortfall", note };
}

/**
 * The fastest average speed any defeat implies, range over time. A run
 * implying more than the interceptor's declared top speed means the speed
 * claim, the logged range, or the logged time is wrong.
 */
function speedConsistency(profile, rows, source) {
  const declared = num(profile["INT-1"]);
  if (declared === null) {
    return null;
  }
  const implied = reached(rows, "defeat")
    .map((row) => {
      const range = num(row.engagement_range_m);
      const time = num(row.time_to_intercept_s);
      return range !== null && time !== null && time > 0 ? range / time : null;
    })
    .filter((value) => value !== null);
  const base = { id: "INT-1", label: "INT-1", measure: "Interceptor max speed", unit: "m/s", declared, n: implied.length, source };
  if (implied.length === 0) {
    return { ...base, demonstrated: null, status: "untested", note: "Needs defeat runs with both engagement range and time to intercept logged." };
  }
  const fastest = round(Math.max(...implied), 1);
  if (fastest > declared) {
    return { ...base, demonstrated: fastest, status: "inconsistent", note: `A defeat implies ${fmt(fastest)} m/s average, faster than the declared top speed. The speed claim, a logged range, or a logged time is wrong.` };
  }
  return { ...base, demonstrated: fastest, status: "consistent", note: "Every defeat implies an average speed within the declared top speed." };
}

/**
 * Every declared claim the evaluation can hold against evidence, with the
 * verdict. Claims no run captures are listed as untestable, so a reader
 * sees the gap rather than an absence.
 *
 * @param {object} profile System profile answers.
 * @param {object} sources Provenance per profile key.
 * @param {object[]} rows One system's engagement rows.
 * @param {object[]} mopGroups Output of deriveMops for the same rows.
 * @returns {object[]}
 */
export function crossCheck(profile, sources, rows, mopGroups) {
  const answers = profile || {};
  const provenance = sources || {};
  const sourceOf = (key) => (provenance[key]?.source === "vendor-sheet" ? "Vendor-declared" : "System profile");
  const mopsById = new Map(flattenMops(mopGroups).map((result) => [result.id, result]));
  const checks = [];
  for (const spec of COMPARABLE) {
    const declared = num(answers[spec.id]);
    if (declared !== null) {
      checks.push(compare(spec, declared, mopsById, sourceOf(spec.id)));
    }
  }
  const speed = speedConsistency(answers, rows, sourceOf("INT-1"));
  if (speed) {
    checks.push(speed);
  }
  for (const spec of UNTESTABLE) {
    const declared = num(answers[spec.id]);
    if (declared !== null) {
      checks.push({ ...spec, declared, demonstrated: null, n: 0, source: sourceOf(spec.id), status: "untested" });
    }
  }
  return checks;
}
