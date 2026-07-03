import { localHour } from "./time.js";

/**
 * Day analytics. Pure functions over engagement rows.
 * Pk counts successes against attempted intercepts only;
 * "not attempted" runs are excluded from the denominator.
 */

const PERIODS = Object.freeze([
  { key: "morning", label: "Morning (0000-1159L)", start: 0, end: 12 },
  { key: "afternoon", label: "Afternoon (1200-1659L)", start: 12, end: 17 },
  { key: "evening", label: "Evening (1700-2359L)", start: 17, end: 24 },
]);

/** @returns {number | null} Pk to two decimals, or null with no attempts. */
export function probabilityOfKill(successes, attempts) {
  if (attempts === 0) {
    return null;
  }
  return Math.round((successes / attempts) * 100) / 100;
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

/** @returns {object} Attempt, success, Pk, and average metric rollup. */
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

/** @returns {object | null} Min/max temperature and wind across snapshots. */
export function summarizeWeather(rows) {
  const snapshots = rows.map((row) => row.weather).filter((w) => w && w.tempF !== null);
  if (snapshots.length === 0) {
    return null;
  }
  const temps = snapshots.map((w) => w.tempF);
  const winds = snapshots.map((w) => w.windKts).filter((v) => v !== null);
  const described = snapshots.map((w) => w.description).filter((d) => d);
  return {
    tempMinF: Math.min(...temps),
    tempMaxF: Math.max(...temps),
    windMinKts: winds.length > 0 ? Math.min(...winds) : null,
    windMaxKts: winds.length > 0 ? Math.max(...winds) : null,
    descriptions: [...new Set(described)],
    samples: snapshots.length,
  };
}

/**
 * Full statistics package for one operational day.
 * @param {object[]} rows Engagement rows joined with drone and interceptor names.
 * @param {string} timezone
 */
export function computeDayStats(rows, timezone) {
  return {
    overall: rollup(rows),
    byInterceptor: rollupBy(rows, (row) => row.interceptor_name),
    byDrone: rollupBy(rows, (row) => row.drone_name),
    byGroup: rollupBy(rows, (row) => row.uas_group && `Group ${row.uas_group}`),
    byPeriod: rollupByPeriod(rows, timezone),
    weather: summarizeWeather(rows),
  };
}
