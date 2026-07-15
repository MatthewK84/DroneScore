import { localHour } from "./time.js";

/**
 * Day analytics. Pure functions over engagement rows.
 *
 * Runs are split by type. A Red Air run is an intercept attempt against a
 * target, so its success rate is a probability of kill. An abort run is an
 * intentional test of the abort or terminate command, so its success rate
 * measures whether the abort worked, which is a different question. Mixing
 * the two understates interceptor performance, so Pk is computed from Red
 * Air runs alone and abort runs are reported separately.
 *
 * Within either type, "not attempted" runs are excluded from the denominator.
 */

const PERIODS = Object.freeze([
  { key: "morning", label: "Morning (0000-1159L)", start: 0, end: 12 },
  { key: "afternoon", label: "Afternoon (1200-1659L)", start: 12, end: 17 },
  { key: "evening", label: "Evening (1700-2359L)", start: 17, end: 24 },
]);

/** @returns {number | null} Success rate to two decimals, or null with no attempts. */
export function probabilityOfKill(successes, attempts) {
  if (attempts === 0) {
    return null;
  }
  return Math.round((successes / attempts) * 100) / 100;
}

/**
 * Rows written before run types existed have no run_type and are treated as
 * Red Air, which preserves the numbers their reports were generated with.
 * @param {object} row
 * @returns {boolean}
 */
export function isAbortRun(row) {
  return row.run_type === "abort";
}

/** @returns {number | null} Mean of finite numeric values, or null. */
function meanOf(values) {
  const numbers = values
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) {
    return null;
  }
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return Math.round((total / numbers.length) * 10) / 10;
}

/** @returns {object} Attempt, success, rate, and average metric rollup. */
function rollup(rows) {
  const attempted = rows.filter((row) => row.outcome !== "not_attempted");
  const successes = attempted.filter((row) => row.outcome === "success");
  return {
    total: rows.length,
    attempts: attempted.length,
    successes: successes.length,
    misses: attempted.length - successes.length,
    notAttempted: rows.length - attempted.length,
    pk: probabilityOfKill(successes.length, attempted.length),
    avgTimeToInterceptS: meanOf(successes.map((row) => row.time_to_intercept_s)),
    avgRangeM: meanOf(attempted.map((row) => row.engagement_range_m)),
  };
}

/** Groups rows by a label extractor and rolls each group up. */
function rollupBy(rows, labelOf) {
  const groups = new Map();
  for (const row of rows) {
    const label = labelOf(row) || "Unspecified";
    const bucket = groups.get(label) || [];
    bucket.push(row);
    groups.set(label, bucket);
  }
  return [...groups.entries()]
    .map(([label, groupRows]) => ({ label, ...rollup(groupRows) }))
    .sort((a, b) => b.attempts - a.attempts);
}

/** @returns {object[]} Rollup per local time-of-day period. */
function rollupByPeriod(rows, timezone) {
  return PERIODS.map((period) => {
    const inPeriod = rows.filter((row) => {
      const hour = localHour(new Date(row.occurred_at), timezone);
      return hour >= period.start && hour < period.end;
    });
    return { label: period.label, ...rollup(inPeriod) };
  }).filter((entry) => entry.total > 0);
}

/**
 * @param {object[]} values
 * @param {string} key
 * @returns {number[]} Only finite numeric values for that key. Guards against
 *   undefined as well as null, so a snapshot missing a field can never turn
 *   into NaN on the report.
 */
function finiteValues(values, key) {
  return values
    .map((entry) => entry[key])
    .filter((value) => typeof value === "number" && Number.isFinite(value));
}

/**
 * @param {object[]} rows
 * @returns {object | null} Range of temperature, wind, and gust across the
 *   day's captured snapshots. Wind is reported in mph to match the flying
 *   conditions thresholds and the live board.
 */
export function summarizeWeather(rows) {
  const snapshots = rows
    .map((row) => row.weather)
    .filter((w) => w && typeof w === "object");
  if (snapshots.length === 0) {
    return null;
  }
  const temps = finiteValues(snapshots, "tempF");
  const winds = finiteValues(snapshots, "windMph");
  const gusts = finiteValues(snapshots, "gustMph");
  const described = snapshots.map((w) => w.description).filter((d) => d);
  if (temps.length === 0 && winds.length === 0) {
    return null;
  }
  return {
    tempMinF: temps.length > 0 ? Math.min(...temps) : null,
    tempMaxF: temps.length > 0 ? Math.max(...temps) : null,
    windMinMph: winds.length > 0 ? Math.min(...winds) : null,
    windMaxMph: winds.length > 0 ? Math.max(...winds) : null,
    gustMaxMph: gusts.length > 0 ? Math.max(...gusts) : null,
    descriptions: [...new Set(described)],
    samples: snapshots.length,
  };
}

/**
 * Full statistics package for one operational day.
 *
 * `overall` covers Red Air runs only, so `overall.pk` is a true probability
 * of kill. `abort` covers abort runs. `totalRuns` counts every logged run of
 * either type.
 *
 * @param {object[]} rows Engagement rows joined with drone and interceptor names.
 * @param {string} timezone
 */
export function computeDayStats(rows, timezone) {
  const redAir = rows.filter((row) => !isAbortRun(row));
  const aborts = rows.filter((row) => isAbortRun(row));
  return {
    totalRuns: rows.length,
    overall: rollup(redAir),
    abort: rollup(aborts),
    byInterceptor: rollupBy(redAir, (row) => row.interceptor_name),
    byDrone: rollupBy(redAir, (row) => row.drone_name),
    byGroup: rollupBy(redAir, (row) => row.uas_group && `Group ${row.uas_group}`),
    byPeriod: rollupByPeriod(redAir, timezone),
    abortByInterceptor: rollupBy(aborts, (row) => row.interceptor_name),
    weather: summarizeWeather(rows),
  };
}
