import { isScenarioKey, isStageKey } from "./criteria.js";

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

/**
 * Kill chain stage reached on a run. Blank stays null rather than
 * defaulting to a stage, so the derivation can label the result as
 * inferred instead of presenting a guess as a measurement.
 * @param {unknown} value
 * @returns {string | null} A kill chain stage key, or null.
 */
export function asStage(value) {
  return isStageKey(value) ? value : null;
}

/**
 * Scenario a run was flown under. An unrecognized value falls back to
 * MLCOA rather than null, because the engagement timeline splits every run
 * into one column or the other and has no third column to put it in.
 * @param {unknown} value
 * @returns {string} "mlcoa" or "mdcoa".
 */
export function asScenario(value) {
  return isScenarioKey(value) ? value : "mlcoa";
}

/**
 * Three-state boolean. Null means the scorer did not answer, which is
 * different from answering no and must not collapse into it.
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function asTriBoolean(value) {
  if (value === true || value === "yes" || value === "true") {
    return true;
  }
  if (value === false || value === "no" || value === "false") {
    return false;
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {number | null} Non-negative integer within bounds, or null.
 */
export function asOptionalInteger(value, max) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  return parsed;
}

/**
 * System profile answers keyed by catalog id. Unknown keys are dropped so
 * a malformed client cannot grow the stored object without bound.
 * @param {unknown} value
 * @param {(id: string) => boolean} isKnownKey
 * @returns {object} Sanitized answers.
 */
export function asProfile(value, isKnownKey) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const clean = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isKnownKey(key)) {
      continue;
    }
    const text = asText(raw, 2000);
    if (text.length > 0) {
      clean[key] = text;
    }
  }
  return clean;
}
