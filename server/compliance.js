import { KPP_CATALOG } from "./kpp-catalog.js";
import { flattenMops } from "./criteria.js";
import { evaluateBenchmark, isYesAdverse } from "./thresholds.js";

/**
 * KPP compliance. Section 4.2 requires the assessment to state, for each
 * KPP, whether the system met the Threshold, fell short, or achieved the
 * Objective. This module answers that question and, for every answer,
 * records where the measured value came from.
 *
 * A KPP is measured from exactly one of three places, in this priority:
 *
 *   1. a MOP derived from the day's runs, which is the strongest evidence
 *   2. an operational-day closeout counter
 *   3. the system profile, which is a vendor or evaluator declaration
 *
 * Anything with no source at all is reported as not measured rather than
 * quietly omitted, because a silent gap in a formal evaluation reads as a
 * pass.
 */

/**
 * Maps a KPP to the MOP that measures it. `scale` converts MOP units into
 * KPP units: MOP ranges are metres and KPP ranges are kilometres, and MOP
 * proportions are fractions where KPP accuracies are percentages.
 */
const KPP_FROM_MOP = Object.freeze({
  "1.1": { mopId: "1.1.2", field: "mean", scale: 0.001 },
  "1.2": { mopId: "1.1.1", field: "value", scale: 100 },
  "1.5": { mopId: "1.1.3a", field: "max", scale: 1 },
  "3a.2": { mopId: "2.1.1", field: "value", scale: 100 },
  "3b.1": { mopId: "2.1.3", field: "mean", scale: 0.001 },
  "5.1": { mopId: "3.1.3", field: "mean", scale: 0.001 },
  "5.4": { mopId: "3.1.2", field: "value", scale: 100 },
  "8.4": { mopId: "4.2.1", field: "value", scale: 1 },
});

/** Maps a KPP to an operational-day closeout column. */
const KPP_FROM_DAY = Object.freeze({
  "6.1": "operate_crew",
  "6.3": "setup_crew",
  "9.4": "setup_minutes",
});

/** @returns {number | null} The scaled numeric value carried by a MOP result. */
function measuredFromMop(mopResult, mapping) {
  if (!mopResult) {
    return null;
  }
  const raw = mapping.field === "value" ? mopResult.value : mopResult.value?.[mapping.field];
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed * mapping.scale * 100) / 100;
}

/** @returns {number | null} A finite number parsed out of an unknown value. */
function asFinite(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {object} entry Catalog entry.
 * @param {Map<string, object>} mopsById
 * @param {object} day
 * @param {object} profile
 * @returns {{ measured: number | null, source: string }}
 */
function measureFor(entry, mopsById, day, profile) {
  const fromMop = KPP_FROM_MOP[entry.id];
  if (fromMop) {
    const measured = measuredFromMop(mopsById.get(fromMop.mopId), fromMop);
    if (measured !== null) {
      return { measured, source: `MOP ${fromMop.mopId}` };
    }
  }
  const dayColumn = KPP_FROM_DAY[entry.id];
  if (dayColumn) {
    const measured = asFinite(day?.[dayColumn]);
    if (measured !== null) {
      return { measured, source: "Day closeout" };
    }
  }
  const declared = asFinite(profile?.[entry.id]);
  if (declared !== null) {
    return { measured: declared, source: "System profile" };
  }
  return { measured: null, source: "" };
}

/** @returns {object} Compliance record for a yes/no KPP. */
function evaluateYesNo(entry, profile) {
  const answer = profile?.[entry.id];
  if (answer !== "yes" && answer !== "no") {
    return { status: "not_measured", measured: null, source: "", detail: "" };
  }
  const adverse = isYesAdverse(entry.id);
  const good = adverse ? answer === "no" : answer === "yes";
  return {
    status: good ? "threshold" : "short",
    measured: null,
    source: "System profile",
    detail: answer === "yes" ? "Yes" : "No",
  };
}

/** @returns {object} Compliance record for a narrative KPP. */
function evaluateNarrative(entry, profile) {
  const text = profile?.[entry.id];
  const stated = typeof text === "string" && text.trim().length > 0;
  return {
    status: stated ? "stated" : "not_measured",
    measured: null,
    source: stated ? "System profile" : "",
    detail: stated ? text.trim() : "",
  };
}

/** @returns {object} Compliance record for a numeric KPP. */
function evaluateNumeric(entry, mopsById, day, profile, benchmark) {
  const { measured, source } = measureFor(entry, mopsById, day, profile);
  const evaluation = evaluateBenchmark(entry.id, measured, benchmark);
  return {
    status: evaluation.status,
    measured,
    source,
    detail: "",
    threshold: evaluation.threshold,
    objective: evaluation.objective,
    basis: evaluation.basis,
  };
}

/**
 * @param {object} entry Catalog entry.
 * @returns {object} The compliance record produced by the matching evaluator.
 */
function evaluateEntry(entry, mopsById, day, profile, benchmark) {
  if (entry.input === "yesno") {
    return evaluateYesNo(entry, profile);
  }
  if (entry.input === "number") {
    return evaluateNumeric(entry, mopsById, day, profile, benchmark);
  }
  return evaluateNarrative(entry, profile);
}

/**
 * Builds the full KPP compliance table for one operational day.
 *
 * @param {object[]} mopGroups Output of deriveMops.
 * @param {object} day Day row with closeout counters.
 * @param {object} profile System profile answers keyed by KPP id.
 * @param {Map<string, object>} benchmarks Stored benchmarks keyed by KPP id.
 * @returns {object[]} One record per catalog entry, in catalog order.
 */
export function buildCompliance(mopGroups, day, profile, benchmarks) {
  const mopsById = new Map(flattenMops(mopGroups).map((result) => [result.id, result]));
  return KPP_CATALOG.map((entry) => {
    const benchmark = benchmarks.get(entry.id) || null;
    const record = evaluateEntry(entry, mopsById, day, profile, benchmark);
    return {
      id: entry.id,
      label: entry.label,
      category: entry.category,
      measure: entry.measure,
      units: entry.units,
      threshold: benchmark?.threshold ?? null,
      objective: benchmark?.objective ?? null,
      basis: benchmark?.basis || "",
      critical: benchmark?.critical === true,
      ...record,
    };
  });
}

/**
 * Resolves which stored benchmark applies, most specific first: this
 * system against this UAS group, then this system against any group, then
 * any system against this group, then the evaluation-wide default.
 *
 * @param {object[]} rows Benchmark rows.
 * @param {number | null} interceptorId
 * @param {string} uasGroup
 * @returns {Map<string, object>} Applicable benchmark per KPP id.
 */
export function resolveBenchmarks(rows, interceptorId, uasGroup) {
  const rank = (row) => {
    const systemMatch = row.interceptor_id !== null && Number(row.interceptor_id) === interceptorId;
    const groupMatch = row.uas_group !== "" && row.uas_group === String(uasGroup);
    return (systemMatch ? 2 : 0) + (groupMatch ? 1 : 0);
  };
  const applies = rows.filter(
    (row) =>
      (row.interceptor_id === null || Number(row.interceptor_id) === interceptorId) &&
      (row.uas_group === "" || row.uas_group === String(uasGroup))
  );
  const best = new Map();
  for (const row of applies) {
    const current = best.get(row.kpp_id);
    if (current === undefined || rank(row) > rank(current)) {
      best.set(row.kpp_id, row);
    }
  }
  return new Map(
    [...best.entries()].map(([kppId, row]) => [
      kppId,
      {
        kppId,
        threshold: row.threshold === null ? null : Number(row.threshold),
        objective: row.objective === null ? null : Number(row.objective),
        unit: row.unit,
        basis: row.basis,
        critical: row.critical === true,
      },
    ])
  );
}

/**
 * @param {object[]} rows Engagement rows.
 * @param {string} key Column naming the thing to count.
 * @returns {string | null} The most frequent non-empty value.
 */
function modeOf(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined || value === "") {
      continue;
    }
    counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length > 0 ? ranked[0][0] : null;
}

/**
 * The system under test for a day is the interceptor flown on the most
 * runs. Days that mixed systems still report one compliance table, and the
 * report names the others rather than silently blending them.
 * @param {object[]} rows
 * @returns {{ interceptorId: number | null, name: string | null, others: string[] }}
 */
export function primarySystem(rows) {
  const id = modeOf(rows, "interceptor_id");
  const names = [...new Set(rows.map((row) => row.interceptor_name).filter((name) => name))];
  const primaryName = rows.find((row) => String(row.interceptor_id) === id)?.interceptor_name || null;
  return {
    interceptorId: id === null ? null : Number(id),
    name: primaryName,
    others: names.filter((name) => name !== primaryName),
  };
}

/** @returns {string} The most frequently engaged UAS group, or "". */
export function primaryGroup(rows) {
  return modeOf(rows, "uas_group") || "";
}

/** @returns {object} Counts of each compliance status across the table. */
export function summarizeCompliance(rows) {
  const counts = { objective: 0, threshold: 0, short: 0, not_established: 0, not_measured: 0, stated: 0 };
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) {
      counts[row.status] += 1;
    }
  }
  return counts;
}
