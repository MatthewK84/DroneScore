/**
 * Client formatting helpers. Pure string functions with no side effects.
 */

/**
 * @param {string} isoDate YYYY-MM-DD.
 * @returns {string} Long form such as "Friday, 03 July 2026".
 */
export function formatDateLong(isoDate) {
  if (typeof isoDate !== "string" || isoDate.length < 10) {
    return isoDate || "";
  }
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(parsed);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(parsed);
  const day = isoDate.slice(8, 10);
  const year = isoDate.slice(0, 4);
  return `${weekday}, ${day} ${month} ${year}`;
}
