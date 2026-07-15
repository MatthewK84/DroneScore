/**
 * Input validation. Every route validates request bodies through
 * these helpers so type handling stays consistent.
 */

const OUTCOMES = Object.freeze(["success", "unsuccessful", "not_attempted"]);
const RUN_TYPES = Object.freeze(["red_air", "abort"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string} Trimmed text limited to max length, or "".
 */
export function asText(value, max = 2000) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string | null} Non-empty trimmed text, or null.
 */
export function requiredText(value, max = 200) {
  const text = asText(value, max);
  return text.length > 0 ? text : null;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null} Finite number within bounds, or null.
 */
export function asOptionalNumber(value, min, max) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

/**
 * @param {unknown} value
 * @returns {string | null} Valid outcome value, or null.
 */
export function asOutcome(value) {
  return typeof value === "string" && OUTCOMES.includes(value) ? value : null;
}

/**
 * Run type distinguishes a Red Air intercept run from an intentional abort
 * run. Blank or unknown input falls back to red_air, matching how rows
 * created before run types existed are stored.
 * @param {unknown} value
 * @returns {string} "red_air" or "abort".
 */
export function asRunType(value) {
  return typeof value === "string" && RUN_TYPES.includes(value) ? value : "red_air";
}

/**
 * @param {unknown} value
 * @returns {string | null} YYYY-MM-DD date string, or null.
 */
export function asIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return null;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {number | null} Positive integer id, or null.
 */
export function asId(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
