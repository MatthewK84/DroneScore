/**
 * Units for vendor-declared values.
 *
 * Vendors write specifications in whatever units their market uses: km/h
 * and kilograms from one, knots and pounds from the next. The criteria
 * catalog stores one unit per measure. This module is the only place the
 * two meet, and it does exactly two things: convert a value between units
 * of the same physical dimension, and refuse anything it cannot read as a
 * single number.
 *
 * Refusing is deliberate. "290-340 km/h" is not a speed, it is a claim
 * about a range of speeds, and choosing a point in it on the vendor's
 * behalf would put a number in the evaluation that nobody wrote down.
 */

/** Factors to each dimension's base unit. Exact where a definition is exact. */
const DIMENSIONS = Object.freeze({
  distance: Object.freeze({ m: 1, km: 1000, ft: 0.3048, mi: 1609.344, nmi: 1852 }),
  speed: Object.freeze({ "m/s": 1, "km/h": 1000 / 3600, kt: 1852 / 3600, mph: 0.44704 }),
  mass: Object.freeze({ kg: 1, lb: 0.45359237 }),
  time: Object.freeze({ s: 1, min: 60, h: 3600 }),
});

/**
 * How each catalog units string is stored. `dimension` null means the unit
 * has no alternative a vendor could reasonably use (a percentage, a count,
 * a dollar amount), so the value is taken as written.
 */
const CATALOG_UNITS = Object.freeze({
  km: { dimension: "distance", unit: "km" },
  m: { dimension: "distance", unit: "m" },
  "m/s or kt": { dimension: "speed", unit: "m/s" },
  "sec / min": { dimension: "time", unit: "s" },
  min: { dimension: "time", unit: "min" },
  kg: { dimension: "mass", unit: "kg" },
  Time: { dimension: "time", unit: "min" },
  "# ppl": { dimension: null, unit: "# ppl" },
  "%": { dimension: null, unit: "%" },
  "+/- %": { dimension: null, unit: "+/- %" },
  deg: { dimension: null, unit: "deg" },
  "#": { dimension: null, unit: "#" },
  Qty: { dimension: null, unit: "Qty" },
  "per sec": { dimension: null, unit: "per sec" },
  "#/hour": { dimension: null, unit: "#/hour" },
  "rounds/minute": { dimension: null, unit: "rounds/minute" },
  $: { dimension: null, unit: "$" },
  g: { dimension: null, unit: "g" },
  "0-100": { dimension: null, unit: "0-100" },
});

const RANGE_PATTERN = /\d\s*(?:-|–|—|to)\s*\d/i;
const NUMBER_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^\.\d+$/;

/**
 * @param {string} catalogUnits Units column of a catalog entry.
 * @returns {{ dimension: string | null, unit: string } | null} Storage
 *   spec, or null when the catalog uses a unit this module has not mapped.
 */
export function unitSpecFor(catalogUnits) {
  return Object.hasOwn(CATALOG_UNITS, catalogUnits) ? CATALOG_UNITS[catalogUnits] : null;
}

/** @returns {string[]} The units a value of this dimension may be written in. */
export function unitsOf(dimension) {
  return Object.hasOwn(DIMENSIONS, dimension) ? Object.keys(DIMENSIONS[dimension]) : [];
}

/**
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 * @param {string} dimension
 * @returns {number | null} The converted value, or null when either unit
 *   does not belong to the dimension.
 */
export function convert(value, fromUnit, toUnit, dimension) {
  const table = DIMENSIONS[dimension];
  if (!table || !Object.hasOwn(table, fromUnit) || !Object.hasOwn(table, toUnit)) {
    return null;
  }
  return (value * table[fromUnit]) / table[toUnit];
}

/** @returns {number} A value rounded to three decimals, for storage. */
export function roundStored(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Reads one non-negative number, as a person would type it on a form.
 * Thousands separators are accepted; ranges, negatives, units, and prose
 * are refused with a reason a vendor can act on.
 *
 * @param {unknown} text
 * @returns {{ empty: true } | { value: number } | { error: string }}
 */
export function parseNumber(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") {
    return { empty: true };
  }
  if (RANGE_PATTERN.test(trimmed)) {
    return { error: "Enter one value, not a range." };
  }
  if (trimmed.startsWith("-")) {
    return { error: "Must not be negative." };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { error: "Not a number. Enter digits only; choose the unit from the list beside the box." };
  }
  return { value: Number.parseFloat(trimmed.replace(/,/g, "")) };
}

/**
 * The unit a stored value is actually in. The catalog prints some units as
 * a choice ("m/s or kt"); a stored value is always in exactly one of them,
 * and a reader needs to know which.
 *
 * @param {string} catalogUnits Units column of a catalog entry.
 * @returns {string}
 */
export function storedUnitLabel(catalogUnits) {
  return unitSpecFor(catalogUnits)?.unit ?? catalogUnits;
}

/**
 * A stored quantity written for a reader: thousands separated, currency
 * before the number, every other unit after it.
 *
 * @param {number} value
 * @param {string} catalogUnits
 * @returns {string}
 */
export function formatQuantity(value, catalogUnits) {
  const unit = storedUnitLabel(catalogUnits);
  const number = value.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (unit === "$") {
    return `$${number}`;
  }
  return `${number} ${unit}`.trim();
}
