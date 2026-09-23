/**
 * Scoring for the consolidated C4 scorecard.
 *
 * The criteria define one scoring scale and one rollup, and this module
 * implements exactly those and nothing else:
 *
 *   0 = Not Met, 1 = Met Threshold, 2 = Met or Exceeded Objective, N/A
 *   Overall System Score = weighted average of the five Core Capability Areas
 *   Any Critical KPP scored 0 flags the system "Not Militarily Effective"
 *
 * A row scores only when a Threshold or Objective was stored before test
 * execution and a value has been measured. Everything else is reported in
 * its own state and kept out of the average. That is deliberate: averaging
 * over rows that were never benchmarked would let an evaluation improve
 * its score by measuring less.
 */

import { C4_AREAS, C4_SUPPORTING, naKey, narrativeKey, verdictKey } from "./c4.js";
import { flattenMops } from "./criteria.js";

/** Compliance statuses mapped onto the 0/1/2 scale the criteria define. */
const SCORE_FOR_STATUS = Object.freeze({
  objective: 2,
  threshold: 1,
  short: 0,
});

/** Compliance statuses that carry no score, mapped to a scorecard state. */
const STATE_FOR_STATUS = Object.freeze({
  not_established: "no_benchmark",
  not_measured: "not_measured",
  stated: "reported",
});

/** Verdict answers that count as meeting the row. */
const FAVORABLE_VERDICTS = Object.freeze(["yes", "pass"]);

/** Verdict answers that count as failing the row. */
const ADVERSE_VERDICTS = Object.freeze(["no", "fail"]);

/** @returns {number | null} A finite number, or null. */
function asFinite(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** @returns {number} A value rounded to two decimals. */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {number} measured
 * @param {object} benchmark Stored benchmark with threshold and objective.
 * @param {boolean} lowerBetter
 * @returns {number} 0, 1, or 2 under the criteria scoring rules.
 */
function scoreAgainst(measured, benchmark, lowerBetter) {
  const meets = (limit) => (lowerBetter ? measured <= limit : measured >= limit);
  if (benchmark.objective !== null && meets(benchmark.objective)) {
    return 2;
  }
  if (benchmark.threshold !== null && meets(benchmark.threshold)) {
    return 1;
  }
  return 0;
}

/** @returns {string} The measured column rendered for a derived row. */
function derivedText(value, units, count) {
  if (value === null) {
    return "";
  }
  const suffix = count === null ? "" : ` (n=${count})`;
  return `${value}${units ? ` ${units}` : ""}${suffix}`;
}

/**
 * Sample size behind a derived MOP, or null when the MOP carries no sample
 * count worth printing. A distribution states how many runs it averaged and
 * a proportion states its denominator; a rate taken off the day closeout
 * counts events rather than samples, so printing its counter as an n would
 * claim a sample size that was never measured.
 *
 * @param {object} result Derived MOP result.
 * @returns {number | null}
 */
function sampleSize(result) {
  if (typeof result.value === "object" && result.value !== null) {
    return result.value.n ?? null;
  }
  return result.units === "" ? result.n ?? null : null;
}

/**
 * Reads a derived MOP off the day's results and converts it into the units
 * the criteria table prints.
 *
 * @param {object} row Scorecard row definition.
 * @param {Map<string, object>} mopsById
 * @returns {{ measured: number | null, n: number | null, basis: string }}
 */
function measureFromMop(row, mopsById) {
  const result = mopsById.get(row.from.mopId);
  if (result === undefined) {
    return { measured: null, n: null, basis: "not derived" };
  }
  const raw = row.from.field === "value" ? result.value : result.value?.[row.from.field];
  const parsed = asFinite(raw);
  const count = sampleSize(result);
  if (parsed === null) {
    return { measured: null, n: count, basis: result.basis || "no data" };
  }
  return { measured: round2(parsed * row.from.scale), n: count, basis: result.basis || "" };
}

/**
 * @param {object} row Scorecard row definition.
 * @param {object} profile System profile answers.
 * @returns {string} "yes", "pass", "no", "fail", or "".
 */
function verdictOf(row, profile) {
  const stored = profile?.[verdictKey(row.id)];
  return typeof stored === "string" ? stored.trim().toLowerCase() : "";
}

/** @returns {object} Scored record for a narrative MOP with a verdict beside it. */
function scoreVerdictRow(row, profile) {
  const verdict = verdictOf(row, profile);
  const notes = profile?.[narrativeKey(row.id)] || "";
  if (FAVORABLE_VERDICTS.includes(verdict)) {
    return { measured: null, measuredText: verdict === "pass" ? "Pass" : "Yes", score: 1, state: "scored", source: "System profile", notes };
  }
  if (ADVERSE_VERDICTS.includes(verdict)) {
    return { measured: null, measuredText: verdict === "fail" ? "Fail" : "No", score: 0, state: "scored", source: "System profile", notes };
  }
  return { measured: null, measuredText: "", score: null, state: "not_measured", source: "", notes };
}

/** @returns {object} Scored record for a row derived from logged runs. */
function scoreDerivedRow(row, mopsById, benchmark) {
  const { measured, n, basis } = measureFromMop(row, mopsById);
  const shared = {
    measured,
    measuredText: derivedText(measured, row.units, n),
    source: "Derived from logged runs",
    notes: basis,
  };
  if (benchmark === null || (benchmark.threshold === null && benchmark.objective === null)) {
    return { ...shared, score: null, state: "no_benchmark" };
  }
  if (measured === null) {
    return { ...shared, score: null, state: "not_measured" };
  }
  return {
    ...shared,
    score: scoreAgainst(measured, benchmark, row.from.lowerBetter === true),
    state: "scored",
  };
}

/** @returns {object} Scored record built from an existing compliance verdict. */
function scoreCatalogRow(row, complianceById) {
  const record = complianceById.get(row.id);
  if (record === undefined) {
    return { measured: null, measuredText: "", score: null, state: "not_measured", source: "", notes: "" };
  }
  const score = SCORE_FOR_STATUS[record.status];
  const measuredText = record.detail || (record.measured === null ? "" : `${record.measured} ${row.units}`.trim());
  return {
    measured: record.measured,
    measuredText,
    score: score === undefined ? null : score,
    state: score === undefined ? STATE_FOR_STATUS[record.status] || "not_measured" : "scored",
    source: record.source || "",
    notes: record.basis || "",
  };
}

/**
 * @param {object} row Scorecard row definition.
 * @returns {string} The label as the criteria table prints it. Interceptor
 *   metric ids already carry their own prefix.
 */
function rowLabel(row) {
  return row.kind === "INT" ? row.id : `${row.kind} ${row.id}`;
}

/**
 * Scores one row. A row marked Not Applicable for this interceptor
 * configuration short-circuits everything else, which is the point of the
 * N/A the criteria define.
 *
 * @param {object} row Scorecard row definition.
 * @param {object} context Derived MOPs, compliance records, profile, benchmarks.
 * @returns {object} The row as it prints in the criteria table.
 */
function scoreRow(row, context) {
  const benchmark = context.benchmarks.get(row.id) || null;
  const base = {
    id: row.id,
    kind: row.kind,
    label: rowLabel(row),
    measure: row.measure,
    units: row.units,
    description: row.description,
    threshold: benchmark?.threshold ?? null,
    objective: benchmark?.objective ?? null,
    critical: benchmark?.critical === true,
    benchmarkBasis: benchmark?.basis || "",
  };
  if (context.profile?.[naKey(row.id)] === "yes") {
    return { ...base, measured: null, measuredText: "", score: null, state: "not_applicable", source: "", notes: "Marked not applicable to this configuration." };
  }
  if (row.from.kind === "mop") {
    return { ...base, ...scoreDerivedRow(row, context.mopsById, benchmark) };
  }
  if (row.from.kind === "verdict") {
    return { ...base, ...scoreVerdictRow(row, context.profile) };
  }
  return { ...base, ...scoreCatalogRow(row, context.complianceById) };
}

/** @returns {object} Counts of every row state inside a collection. */
function countStates(rows) {
  const counts = { scored: 0, not_applicable: 0, reported: 0, no_benchmark: 0, not_measured: 0 };
  for (const row of rows) {
    if (Object.hasOwn(counts, row.state)) {
      counts[row.state] += 1;
    }
  }
  return counts;
}

/** @returns {number | null} Mean of the scored rows, or null when none scored. */
function meanScore(rows) {
  const scored = rows.filter((row) => row.state === "scored");
  if (scored.length === 0) {
    return null;
  }
  const total = scored.reduce((sum, row) => sum + row.score, 0);
  return round2(total / scored.length);
}

/** @returns {object} One Core Capability Area, scored. */
function scoreArea(area, context) {
  const sections = area.sections.map((section) => ({
    title: section.title,
    note: section.note || "",
    rows: section.rows.map((row) => scoreRow(row, context)),
  }));
  const rows = sections.flatMap((section) => section.rows);
  return {
    id: area.id,
    name: area.name,
    note: area.note || "",
    weight: area.weight,
    sections,
    score: meanScore(rows),
    states: countStates(rows),
    total: rows.length,
  };
}

/**
 * @param {object[]} areas Scored Core Capability Areas.
 * @returns {number | null} Weighted average, or null when nothing scored.
 */
function overallScore(areas) {
  const scored = areas.filter((area) => area.score !== null);
  if (scored.length === 0) {
    return null;
  }
  const weight = scored.reduce((sum, area) => sum + area.weight, 0);
  if (weight <= 0) {
    return null;
  }
  const total = scored.reduce((sum, area) => sum + area.score * area.weight, 0);
  return round2(total / weight);
}

/** @returns {object[]} Critical rows that scored 0, with their area. */
function criticalFailures(areas) {
  const failures = [];
  for (const area of areas) {
    for (const section of area.sections) {
      for (const row of section.rows) {
        if (row.critical && row.state === "scored" && row.score === 0) {
          failures.push({ id: row.id, label: row.label, measure: row.measure, area: area.id });
        }
      }
    }
  }
  return failures;
}

/** @returns {object[]} Supporting KPP groups, reported but never scored into the total. */
function supportingGroups(complianceRows) {
  return C4_SUPPORTING.map((group) => ({
    section: group.section,
    name: group.name,
    rows: complianceRows.filter((row) => row.category === group.category),
  }));
}

/**
 * Builds the whole scorecard for one operational day.
 *
 * @param {object[]} mopGroups Output of deriveMops.
 * @param {object[]} complianceRows Output of buildCompliance.
 * @param {object} profile System profile answers.
 * @param {Map<string, object>} benchmarks Applicable benchmarks by row id.
 * @returns {object} Areas, supporting groups, overall score, and the flag.
 */
export function buildScorecard(mopGroups, complianceRows, profile, benchmarks) {
  const context = {
    mopsById: new Map(flattenMops(mopGroups).map((result) => [result.id, result])),
    complianceById: new Map(complianceRows.map((record) => [record.id, record])),
    profile: profile || {},
    benchmarks,
  };
  const areas = C4_AREAS.map((area) => scoreArea(area, context));
  const failures = criticalFailures(areas);
  const rows = areas.flatMap((area) => area.sections.flatMap((section) => section.rows));
  return {
    areas,
    supporting: supportingGroups(complianceRows),
    overall: overallScore(areas),
    states: countStates(rows),
    total: rows.length,
    criticalFailures: failures,
    notMilitarilyEffective: failures.length > 0,
  };
}
