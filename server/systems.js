/**
 * Per-system criteria, one interceptor at a time.
 *
 * Everything the criteria measure is a property of one system under test.
 * A day that flew two interceptors is two evaluations that happen to share
 * a range, so every MOP, compliance verdict, scorecard, and timeline here
 * is derived from exactly one system's runs and nobody else's. Deriving a
 * MOP from a mix of systems produces a number that describes no system.
 *
 * Two things are not partitioned by run:
 *
 *   Day closeout counters (false alarms, operating minutes, system aborts,
 *   repair minutes, crew, setup time) are entered once per day. Every
 *   system documented on a day shares that day's range space, so the
 *   closeout describes the conditions all of them operated in and applies
 *   to each of them in full.
 *
 *   Runs logged with no interceptor cannot belong to any system. They are
 *   counted and reported, and excluded from every per-system figure.
 */

import { computeDayStats } from "./analytics.js";
import { buildScorecard } from "./c4-score.js";
import { buildCompliance, primaryGroup, primarySystem, resolveBenchmarks, summarizeCompliance } from "./compliance.js";
import { deriveMops, deriveTimeline } from "./criteria.js";

/**
 * Closeout counters that accumulate across days. A rate built from them
 * is only honest when every one of them was recorded for the day, so a day
 * with a partial closeout contributes none of them rather than some.
 */
const FLOW_COUNTERS = Object.freeze(["false_alarms", "operating_minutes", "system_aborts", "repair_minutes"]);

/** Closeout counters that describe a level, where the latest value stands. */
const LEVEL_COUNTERS = Object.freeze(["operate_crew", "setup_crew", "setup_minutes"]);

/** @returns {boolean} True for a run that tests the kill chain. */
function isRedAir(row) {
  return row.run_type !== "abort";
}

/** @returns {boolean} True when the run names an interceptor. */
function hasSystem(row) {
  return row.interceptor_id !== null && row.interceptor_id !== undefined;
}

/** @returns {number | null} A finite number, or null. */
function finite(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** @returns {boolean} True when the day recorded every flow counter. */
function hasCompleteFlows(day) {
  return FLOW_COUNTERS.every((key) => finite(day[key]) !== null);
}

/**
 * Combines several days' closeout counters into one set, for a system
 * scored across the whole evaluation. Flow counters sum, but only over days
 * that recorded all of them: false alarm rate and mean time between aborts
 * both divide by operating time, and a day whose alarms went unrecorded
 * would add hours to the denominator with nothing in the numerator. Level
 * counters take the latest recorded value.
 *
 * @param {object[]} days Day rows in chronological order.
 * @returns {{ counters: object, completeDays: number, partialDays: number }}
 */
export function combineDayCounters(days) {
  const complete = days.filter(hasCompleteFlows);
  const counters = {};
  for (const key of FLOW_COUNTERS) {
    counters[key] = complete.length === 0 ? null : complete.reduce((sum, day) => sum + finite(day[key]), 0);
  }
  for (const key of LEVEL_COUNTERS) {
    const recorded = days.map((day) => finite(day[key])).filter((value) => value !== null);
    counters[key] = recorded.length === 0 ? null : recorded[recorded.length - 1];
  }
  return { counters, completeDays: complete.length, partialDays: days.length - complete.length };
}

/**
 * Splits runs by interceptor, primary system first, then by intercept runs
 * flown, then by name so the order is stable between renders.
 *
 * @param {object[]} rows Engagement rows joined with interceptor name.
 * @returns {{ interceptorId: number, name: string, rows: object[] }[]}
 */
export function partitionBySystem(rows) {
  const groups = new Map();
  for (const row of rows.filter(hasSystem)) {
    const id = Number(row.interceptor_id);
    const group = groups.get(id) || { interceptorId: id, name: row.interceptor_name || `Interceptor ${id}`, rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }
  const primaryId = primarySystem(rows.filter(isRedAir)).interceptorId;
  const redAirCount = (group) => group.rows.filter(isRedAir).length;
  return [...groups.values()].sort((a, b) => {
    if (a.interceptorId === primaryId) {
      return -1;
    }
    if (b.interceptorId === primaryId) {
      return 1;
    }
    return redAirCount(b) - redAirCount(a) || b.rows.length - a.rows.length || a.name.localeCompare(b.name);
  });
}

/**
 * Builds the full criteria package for one system.
 *
 * @param {{ interceptorId: number | null, name: string | null, rows: object[] }} group
 * @param {object} day Day row, or combined closeout counters across days.
 * @param {object[]} benchmarkRows Every stored benchmark.
 * @returns {object} MOPs, compliance, scorecard, and timeline for the system.
 */
export function assembleSystem(group, day, benchmarkRows) {
  const profile = group.rows.find((row) => row.interceptor_profile)?.interceptor_profile || {};
  const redAir = group.rows.filter(isRedAir);
  const uasGroup = primaryGroup(redAir);
  const mops = deriveMops(group.rows, day, profile);
  const benchmarks = resolveBenchmarks(benchmarkRows, group.interceptorId, uasGroup);
  const compliance = buildCompliance(mops, day, profile, benchmarks);
  return {
    system: { interceptorId: group.interceptorId, name: group.name, others: [] },
    uasGroup,
    runs: group.rows.length,
    redAirRuns: redAir.length,
    mops,
    compliance,
    summary: summarizeCompliance(compliance),
    scorecard: buildScorecard(mops, compliance, profile, benchmarks),
    timeline: deriveTimeline(group.rows),
  };
}

/**
 * Builds one criteria package per interceptor flown on a day. Every system
 * shares the day's range space, so each is scored with the full closeout.
 *
 * @param {object} day Day row with closeout counters.
 * @param {object[]} rows Every engagement of the day.
 * @param {object[]} benchmarkRows Every stored benchmark.
 * @returns {object[]} Packages, primary system first.
 */
export function assembleSystems(day, rows, benchmarkRows) {
  return partitionBySystem(rows).map((group) => assembleSystem(group, day, benchmarkRows));
}

/** @returns {number} Runs that name no interceptor and so belong to no system. */
export function countUnassigned(rows) {
  return rows.filter((row) => !hasSystem(row)).length;
}

/** @returns {object} Objective, threshold, and not-met counts among scored rows. */
function attainmentOf(scorecard) {
  const counts = { objective: 0, threshold: 0, notMet: 0 };
  for (const area of scorecard.areas) {
    for (const section of area.sections) {
      for (const row of section.rows.filter((entry) => entry.state === "scored")) {
        if (row.score === 2) {
          counts.objective += 1;
        } else if (row.score === 1) {
          counts.threshold += 1;
        } else {
          counts.notMet += 1;
        }
      }
    }
  }
  return counts;
}

/**
 * The public face of a scorecard: scores and counts only. Measured values,
 * benchmarks, bases, and profile text never leave this function, because
 * the viewer role is the general population and the system profile holds
 * accreditation details and cybersecurity findings.
 *
 * @param {object} scorecard Output of buildScorecard.
 * @returns {object} Aggregate progress fields.
 */
function publicProgress(scorecard) {
  return {
    overall: scorecard.overall,
    total: scorecard.total,
    states: { ...scorecard.states },
    attainment: attainmentOf(scorecard),
    notMilitarilyEffective: scorecard.notMilitarilyEffective,
    criticalFailures: scorecard.criticalFailures.map((entry) => ({ label: entry.label, measure: entry.measure })),
    areas: scorecard.areas.map((area) => ({
      id: area.id,
      name: area.name,
      score: area.score,
      scored: area.states.scored,
      total: area.total,
    })),
  };
}

/**
 * Scores one system on every run it has flown up to a date, with the
 * closeout of every day it flew.
 *
 * @returns {object} The scorecard as of that date.
 */
function cumulativeScorecard(group, flownDays, benchmarkRows) {
  const { counters } = combineDayCounters(flownDays);
  return assembleSystem(group, counters, benchmarkRows).scorecard;
}

/** @returns {string} A day's date as YYYY-MM-DD. */
function dateOf(row) {
  return String(row.day_date);
}

/**
 * Progress of one system toward the criteria, now and after each day it
 * flew, so a reader can see the evaluation fill in over time.
 *
 * @returns {object} Aggregate progress for one system.
 */
function progressFor(group, days, benchmarkRows, timezone) {
  const flownDayIds = new Set(group.rows.map((row) => String(row.day_id)));
  const flownDays = days.filter((day) => flownDayIds.has(String(day.id)));
  const flownDates = [...new Set(group.rows.map(dateOf))].sort();
  const history = flownDates.map((date) => {
    const upTo = { ...group, rows: group.rows.filter((row) => dateOf(row) <= date) };
    const daysUpTo = flownDays.filter((day) => dateOf(day) <= date);
    const scorecard = cumulativeScorecard(upTo, daysUpTo, benchmarkRows);
    return { date, overall: scorecard.overall, scored: scorecard.states.scored };
  });
  const scorecard = cumulativeScorecard(group, flownDays, benchmarkRows);
  const stats = computeDayStats(group.rows, timezone);
  const closeout = combineDayCounters(flownDays);
  return {
    name: group.name,
    daysFlown: flownDates.length,
    runs: group.rows.length,
    redAirRuns: stats.overall.total,
    pk: stats.overall.pk,
    closeoutDays: closeout.completeDays,
    ...publicProgress(scorecard),
    history,
  };
}

/**
 * Progress of every interceptor toward JIATF 401 C4 criteria compliance,
 * scored cumulatively across the whole evaluation.
 *
 * @param {object[]} engagements Every engagement, joined with interceptor
 *   name and profile, UAS group, and the day's date as day_date.
 * @param {object[]} days Every day row, day_date as YYYY-MM-DD, oldest first.
 * @param {object[]} benchmarkRows Every stored benchmark.
 * @param {string} timezone Evaluation timezone.
 * @returns {{ systems: object[], unassignedRuns: number }}
 */
export function buildProgress(engagements, days, benchmarkRows, timezone) {
  const systems = partitionBySystem(engagements).map((group) =>
    progressFor(group, days, benchmarkRows, timezone)
  );
  return { systems, unassignedRuns: countUnassigned(engagements) };
}
