/**
 * Splits Core Capability Areas into those with assessed rows and those
 * without. An area whose every row is Not Repeatably Assessable has no
 * score to show, so the screens collapse it into one line instead of
 * printing an empty tile.
 */

/** @returns {string} "1", "1 and 2", or "1, 2 and 3". */
function joinIds(ids) {
  return ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/**
 * @param {{ id: string, total: number }[]} areas Scored areas.
 * @returns {{ shown: object[], emptyNote: string }} Areas to draw as tiles,
 *   and a sentence naming the rest, or "" when none are empty.
 */
export function splitAreas(areas) {
  const shown = areas.filter((area) => area.total > 0);
  const empty = areas.filter((area) => area.total === 0).map((area) => area.id);
  if (empty.length === 0) {
    return { shown, emptyNote: "" };
  }
  const noun = empty.length === 1 ? "Criterion" : "Criteria";
  const verb = empty.length === 1 ? "has" : "have";
  return { shown, emptyNote: `${noun} ${joinIds(empty)} ${verb} no repeatably assessable rows.` };
}
