/**
 * Pure helpers for the engagement board: outcome meaning, run order,
 * per-interceptor tallies, and the time-to-intercept scale. The counting
 * rules match server/analytics.js, so the board and the report agree: a
 * run with no attempt stays out of Pk, and mean time to intercept counts
 * successful runs only.
 */

const RECENT_MS = 5 * 60 * 1000;

/** What each stored outcome means on an intercept run and on an abort run. */
const OUTCOME_VIEWS = Object.freeze({
  red_air: Object.freeze({
    success: { kind: "good", label: "Success" },
    unsuccessful: { kind: "bad", label: "Miss" },
    not_attempted: { kind: "none", label: "No attempt" },
  }),
  abort: Object.freeze({
    success: { kind: "good", label: "Abort OK" },
    unsuccessful: { kind: "bad", label: "Abort failed" },
    not_attempted: { kind: "none", label: "No attempt" },
  }),
});

/** @returns {boolean} True for an intentional abort run. */
export function isAbort(engagement) {
  return engagement.runType === "abort";
}

/**
 * @param {object} engagement
 * @returns {{ kind: "good" | "bad" | "none", label: string }} The outcome's
 *   meaning and its label for this run type.
 */
export function outcomeView(engagement) {
  const views = isAbort(engagement) ? OUTCOME_VIEWS.abort : OUTCOME_VIEWS.red_air;
  return views[engagement.outcome] || { kind: "none", label: String(engagement.outcome || "Unknown") };
}

/** @returns {number} A timestamp in milliseconds, or 0 when unreadable. */
function timeOf(engagement) {
  const parsed = Date.parse(engagement.occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** @returns {object[]} A copy in the order the runs were flown. */
export function chronological(engagements) {
  return [...engagements].sort((a, b) => timeOf(a) - timeOf(b) || a.id - b.id);
}

/** @returns {object[]} A copy with the latest run first. */
export function newestFirst(engagements) {
  return chronological(engagements).reverse();
}

/** @returns {{ redAir: object[], aborts: object[] }} Runs split by type, oldest first. */
export function splitRuns(engagements) {
  const ordered = chronological(engagements);
  return { redAir: ordered.filter((row) => !isAbort(row)), aborts: ordered.filter(isAbort) };
}

/** @returns {number | null} A finite number, or null. */
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** @returns {number | null} Mean to one decimal, or null for an empty list. */
function mean(values) {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/** @returns {object} Attempts, successes, Pk, and mean time to intercept for runs. */
function tallyOf(name, runs) {
  const attempted = runs.filter((row) => row.outcome !== "not_attempted");
  const successes = attempted.filter((row) => row.outcome === "success");
  const times = successes.map((row) => finite(row.timeToInterceptS)).filter((value) => value !== null);
  return {
    name,
    runs,
    attempts: attempted.length,
    successes: successes.length,
    pk: attempted.length === 0 ? null : successes.length / attempted.length,
    meanTtiS: mean(times),
  };
}

/**
 * @param {object[]} redAir Intercept runs, oldest first.
 * @returns {object[]} One tally per interceptor, most attempts first.
 */
export function interceptorTallies(redAir) {
  const groups = new Map();
  for (const row of redAir) {
    const name = row.interceptorName || "Unassigned";
    groups.set(name, [...(groups.get(name) || []), row]);
  }
  return [...groups.entries()]
    .map(([name, runs]) => tallyOf(name, runs))
    .sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name));
}

/** @returns {number | null} The slowest time to intercept of the day, or null. */
export function slowestTti(engagements) {
  const times = engagements.map((row) => finite(row.timeToInterceptS)).filter((value) => value !== null);
  return times.length === 0 ? null : Math.max(...times);
}

/** @returns {number} A bar's share of the scale, from 0 to 1. */
export function barShare(value, max) {
  if (finite(value) === null || finite(max) === null || max <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
}

/** @returns {boolean} True for a run logged within the last five minutes. */
export function isRecent(engagement, nowMs) {
  const at = timeOf(engagement);
  return at > 0 && nowMs - at >= 0 && nowMs - at <= RECENT_MS;
}

/** @returns {string} Local HH:MM for a run, or "". */
export function clockOf(engagement) {
  const at = timeOf(engagement);
  if (at === 0) {
    return "";
  }
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** @returns {string} Pk to two decimals, or "--". */
export function formatPk(pk) {
  return pk === null || pk === undefined ? "--" : pk.toFixed(2);
}

/** @returns {string[]} Short weather readings for one run, or none. */
export function weatherChips(weather) {
  if (!weather) {
    return [];
  }
  const chips = [];
  if (typeof weather.tempF === "number") {
    chips.push(`${weather.tempF} F`);
  }
  if (typeof weather.windMph === "number") {
    const gust = typeof weather.gustMph === "number" ? ` G${weather.gustMph}` : "";
    chips.push(`Wind ${weather.windMph}${gust} mph`);
  }
  if (weather.description) {
    chips.push(String(weather.description));
  }
  return chips;
}
