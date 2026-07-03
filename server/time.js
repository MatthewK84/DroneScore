/**
 * Time helpers. The operational day follows the configured timezone,
 * so a 2330L engagement lands on the correct local date.
 */

/**
 * @param {string} timezone IANA timezone name.
 * @param {Date} [when]
 * @returns {string} Local calendar date as YYYY-MM-DD.
 */
export function operationalDate(timezone, when = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

/**
 * @param {Date} when
 * @param {string} timezone
 * @returns {string} Local time as HHMM (24 hour).
 */
export function formatTimeLocal(when, timezone) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
  return formatted.replace(":", "");
}

/**
 * @param {Date} when
 * @param {string} timezone
 * @returns {number} Local hour of day, 0 through 23.
 */
export function localHour(when, timezone) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(when);
  const parsed = Number.parseInt(formatted, 10);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

/**
 * @param {string} isoDate YYYY-MM-DD.
 * @returns {string} Long form such as "Friday, 03 July 2026".
 */
export function formatDateLong(isoDate) {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parsed);
  const day = isoDate.slice(8, 10);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
  const year = isoDate.slice(0, 4);
  return `${weekday}, ${day} ${month} ${year}`;
}

/**
 * @param {string} isoDate YYYY-MM-DD.
 * @returns {string} Compact form such as 20260703.
 */
export function compactDate(isoDate) {
  return isoDate.replaceAll("-", "");
}
