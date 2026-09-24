/**
 * Pure helpers for the timeline preset list. They decide each row's
 * status against the stored benchmarks and build the items a bulk write
 * sends. The server repeats the comparison inside its transaction, so
 * these only drive what the screen shows before a click.
 */

const STAMP_PATTERN = /^\[C4 ETA 60\/180 preset: [^\]]*\]\s*/;
const PHASE_KEYS = Object.freeze(["track", "classify", "identify", "decide", "effect", "assess"]);

/** Phase keys in kill chain order, for forms and the timeline strip. */
export const PHASES = PHASE_KEYS;

/** Suffix a single-level write adds, so the basis says what it kept. */
const KEPT_NOTE = Object.freeze({
  threshold: "Objective kept from the stored benchmark.",
  objective: "Threshold kept from the stored benchmark.",
});

/** @returns {string} Basis text with any leading preset stamp removed. */
export function stripStamp(basis) {
  return String(basis || "").replace(STAMP_PATTERN, "");
}

/**
 * @param {object[]} benchmarks Stored benchmarks in API shape.
 * @param {number | null} interceptorId Selected scope.
 * @param {string} kppId
 * @returns {object | null} The stored benchmark at exactly this scope.
 */
export function findStored(benchmarks, interceptorId, kppId) {
  const match = benchmarks.find(
    (entry) => entry.kppId === kppId && entry.interceptorId === interceptorId && entry.uasGroup === ""
  );
  return match || null;
}

/** @returns {boolean} True when a stored benchmark equals an item to write. */
export function sameAsStored(stored, item) {
  return (
    stored.threshold === item.threshold &&
    stored.objective === item.objective &&
    (stored.unit || "") === (item.unit || "") &&
    stripStamp(stored.basis) === stripStamp(item.basis)
  );
}

/** @returns {boolean} True when a click can write this row. */
export function isWritable(row) {
  return row.applicable === true && row.store !== null;
}

/**
 * @param {object} row A preview row from derive-timeline.
 * @param {object | null} stored The stored benchmark at the selected scope.
 * @returns {"na" | "not_covered" | "unpopulated" | "not_stored" | "matches" | "differs"}
 */
export function rowStatus(row, stored) {
  if (!row.applicable) {
    return "na";
  }
  if (row.source === "not_covered") {
    return "not_covered";
  }
  if (row.store === null) {
    return "unpopulated";
  }
  if (stored === null) {
    return "not_stored";
  }
  return sameAsStored(stored, fullItem(row)) ? "matches" : "differs";
}

/** @returns {object} The item that writes a row's preset at both levels. */
function fullItem(row) {
  const { threshold, objective, unit, basis } = row.store;
  return { kppId: row.id, threshold, objective, unit, basis };
}

/**
 * Builds the bulk item for one click.
 *
 * @param {object} row A writable preview row.
 * @param {"both" | "threshold" | "objective"} mode Which level to apply.
 * @param {object | null} stored The stored benchmark, whose other level
 *   a single-level write keeps.
 * @returns {object} { kppId, threshold, objective, unit, basis }
 */
export function buildItem(row, mode, stored) {
  const item = fullItem(row);
  if (mode === "both") {
    return item;
  }
  const kept = mode === "threshold" ? "objective" : "threshold";
  return { ...item, [kept]: stored ? stored[kept] : null, basis: `${item.basis} ${KEPT_NOTE[mode]}` };
}

/** @returns {object[]} Writable rows from one preset source. */
export function writableBySource(rows, source) {
  return rows.filter((row) => row.source === source && isWritable(row));
}

/**
 * @param {object[]} items Items about to be written.
 * @param {object[]} benchmarks Stored benchmarks in API shape.
 * @param {number | null} interceptorId Selected scope.
 * @returns {object[]} { kppId, current, next } for every item that would
 *   change a stored row.
 */
export function conflictsFor(items, benchmarks, interceptorId) {
  return items
    .map((item) => ({ item, stored: findStored(benchmarks, interceptorId, item.kppId) }))
    .filter(({ item, stored }) => stored !== null && !sameAsStored(stored, item))
    .map(({ item, stored }) => ({ kppId: item.kppId, current: stored, next: item }));
}

/** @returns {{ section: string, rows: object[] }[]} Rows grouped in resolver order. */
export function groupBySection(rows) {
  const sections = [];
  for (const row of rows) {
    const last = sections[sections.length - 1];
    if (last && last.section === row.section) {
      last.rows.push(row);
      continue;
    }
    sections.push({ section: row.section, rows: [row] });
  }
  return sections;
}

/** @returns {number | null} Sum of a level's phase budgets, or null if any is blank. */
export function phaseSum(level) {
  const values = PHASE_KEYS.map((key) => Number.parseFloat(level?.phases?.[key]));
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * @param {object} row A preview row.
 * @param {"threshold" | "objective"} level
 * @returns {string} The level's preset as the list shows it.
 */
export function formatPresetValue(row, level) {
  const value = row[level];
  if (value === null || value === undefined) {
    return "--";
  }
  if (row.input === "yesno") {
    return value === "required" ? "Required" : "Not required";
  }
  return row.units ? `${value} ${row.units}` : String(value);
}

/** @returns {string} A stored level as the list shows it. */
export function formatStoredValue(value, unit) {
  if (value === null || value === undefined) {
    return "--";
  }
  if (unit === "Y/N") {
    return value === 1 ? "Required" : "Not required";
  }
  return unit ? `${value} ${unit}` : String(value);
}
