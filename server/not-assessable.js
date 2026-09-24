import { C4_AREAS } from "./c4.js";
import { catalogByCategory, KPP_BY_ID, KPP_CATALOG } from "./kpp-catalog.js";

/**
 * Criteria the evaluation does not assess.
 *
 * Every row here was taken out of scoring because a range scorer cannot
 * measure it repeatably against a clear definition. Some rows score an
 * event inside the system that only its Ground Control Station (GCS)
 * records. Some need endgame instrumentation of the OWLSS class. Some have
 * no published standard for a Threshold or Objective, and some need a
 * specialist test or data the range does not hold.
 *
 * This list is the single source of truth. The scorecard, the compliance
 * tables, the capture screens, and both reports read it. Nothing stored is
 * deleted, so deleting a line here returns that row to the assessment.
 */

/** Why a group of rows is not assessed. */
export const NOT_ASSESSABLE_REASONS = Object.freeze({
  gcs: Object.freeze({
    title: "Needs the Ground Control Station",
    summary:
      "Scores an event or screen state inside the system. A range scorer only hears what the operator " +
      "says, so the result would depend on who was listening. A GCS mirror or a timestamped GCS log is needed.",
  }),
  endgame: Object.freeze({
    title: "Needs endgame instrumentation",
    summary:
      "Scores what happens in the last instant of an intercept, or where the pieces land. That needs " +
      "OWLSS-class high-speed optics and time-space-position data, not a scorer's eye.",
  }),
  no_standard: Object.freeze({
    title: "No published standard",
    summary:
      "Not derived. No public authoritative source establishes a required defeat or detection " +
      "probability per UAS group, so any figure here would be invented. The evaluation does not score it.",
  }),
  not_applicable: Object.freeze({
    title: "Does not apply to a direct-hit interceptor",
    summary: "The measure describes a defeat mechanism the system under test does not use.",
  }),
  specialist: Object.freeze({
    title: "Needs a specialist test, program data, or a clearer definition",
    summary:
      "The measure needs a lab, a certification review, a threat emulator, or program cost data. Or the " +
      "criteria give it no definition a common person could apply the same way twice.",
  }),
});

const NO_PK_STANDARD = "No public source sets a required Pk for this defeat type, so a Threshold or Objective would be invented.";
const NO_COUNT_STANDARD = "No public source sets a required simultaneous target count per UAS group.";
const NOT_DIRECT_HIT = "It also describes a defeat type a direct-hit interceptor does not use.";
const DETECT_EVENT = "Needs the moment the system first detected the target, from the GCS log, and the target's own position at that moment.";
const ALTITUDE_EVENT = "Needs the GCS detection event paired with the target's logged altitude.";
const DECISION_AID = "Whether the operator's display offers this aid can only be checked on that screen.";
const CYBER = "Needs a cybersecurity assessment team and an approved test plan.";
const EW_TEST = "Needs threat electronic attack emulation and a defined measure of degradation.";
const PROGRAM_COST = "Set by the program budget and vendor pricing, not measured at the range.";

/** @returns {object} One row that is not assessed. */
function entry(id, reason, why, extra = {}) {
  return Object.freeze({ id, reason, why, ...extra });
}

const GCS_ROWS = [
  entry("1.1.1", "gcs", "Detection is the system's own event. Only its GCS log shows whether and when it saw each target."),
  entry("1.1.2", "gcs", DETECT_EVENT),
  entry("1.1.3", "gcs", DETECT_EVENT),
  entry("1.1.3a", "gcs", ALTITUDE_EVENT, { label: "MOP 1.1.3a", measure: "Detection Altitude" }),
  entry("1.1.4", "gcs", "False tracks appear only on the GCS display, so a range scorer cannot count them."),
  entry("1.1", "gcs", DETECT_EVENT),
  entry("1.3", "gcs", "Coverage is shown by where detections appear on the GCS display across the sector, not by watching the sky."),
  entry("1.4", "gcs", ALTITUDE_EVENT),
  entry("1.5", "gcs", ALTITUDE_EVENT),
  entry("1.7", "gcs", "Whether detections become tracks automatically is visible only on the operator's screen."),
  entry("1.8", "gcs", "Needs two targets at a known separation and the GCS display to show whether they resolve as two tracks."),
  entry("1.2.1", "gcs", "A track exists only inside the system, so only the GCS shows whether one formed."),
  entry("1.2.2", "gcs", "Track drops and reacquisitions show only in the GCS track log."),
  entry("1.2.3", "gcs", "Needs the GCS track log compared against the target's own GPS log."),
  entry("2.1", "gcs", "Needs the GCS time the track formed and the target's own position at that moment."),
  entry("2.2", "gcs", "Needs the GCS track compared against the target's own GPS log for position and speed."),
  entry("2.4", "gcs", "Whether the track follows a maneuver without operator help shows only on the GCS display."),
  entry("2.5", "gcs", "The refresh rate of the track picture is visible only on the GCS or in its log."),
  entry("2.1.1", "gcs", "Scores the label the system gave the target, which only the GCS shows."),
  entry("2.1.2", "gcs", "Scores the type the system reported, which only the GCS shows. An operator's call is not the system's answer."),
  entry("2.1.3", "gcs", "Needs the GCS time of identification and the target's own position at that moment."),
  entry("2.1.3t", "gcs", "Starts and ends on system events, first detection and identification, that only the GCS timestamps."),
  entry("2.1.4", "gcs", "Scores the type the system reported, which only the GCS shows."),
  entry("3a.1", "gcs", "Needs the GCS time of classification and the target's own position at that moment."),
  entry("3a.3", "gcs", "Whether sensor fusion classifies the target without operator input shows only on the GCS."),
  entry("3b.1", "gcs", "Needs the GCS time of identification and the target's own position at that moment."),
  entry("3b.2", "gcs", "Whether sensor fusion identifies the target without operator input shows only on the GCS."),
  entry("3.1.1", "gcs", "Its denominator is targets the system identified, which only the GCS records."),
  entry("4.1", "gcs", "Weapons-quality track data is a system state shown only on the GCS."),
  entry("4.5", "gcs", "Whether weapons-quality data forms without operator input shows only on the GCS."),
  entry("6.2", "gcs", "An identification recommendation appears only on the operator's display."),
  entry("6.2a", "gcs", DECISION_AID),
  entry("6.2b", "gcs", DECISION_AID),
  entry("6.2c", "gcs", DECISION_AID),
  entry("6.2d", "gcs", DECISION_AID),
  entry("6.2e", "gcs", DECISION_AID),
  entry("6.2f", "gcs", DECISION_AID),
  entry("6.2g", "gcs", "Needs someone at the operator station to confirm when alerts sound and what triggers them."),
  entry("7.2a", "gcs", "Needs a demonstrated feed from an external sensor through the C2, confirmed on the GCS."),
  entry("5.3.2", "gcs", "Exchanging restricted firing sectors with C2 shows only inside the GCS and its C2 link."),
  entry("INT-4", "gcs", "Seeker acquisition exists only in the interceptor's telemetry."),
  entry("INT-5", "gcs", "Seeker lock exists only in the interceptor's telemetry."),
  entry("INT-7", "gcs", "In-flight updates travel over the datalink and show only in GCS telemetry."),
  entry("INT-10", "gcs", "Coordination between interceptors happens inside the GCS and the datalink."),
  entry("10.2", "gcs", "Needs the GCS display frozen mid-run and answers scored against ground truth by a trained administrator."),
  entry(
    "timeline",
    "gcs",
    "Phase times start and end on system events (detect, track, classify, identify, decide) that only the GCS timestamps.",
    { label: "Section 7", measure: "Engagement Timeline Analysis" }
  ),
];

const ENDGAME_ROWS = [
  entry("3.1.3", "endgame", "Needs the intercept point's position, from time-space-position data or interceptor telemetry."),
  entry("5.1", "endgame", "Needs the intercept point's position relative to the weapon, from time-space-position data."),
  entry("5.7", "endgame", "Needs the debris and descent footprint measured, and the criteria do not define the acceptable limits."),
  entry("INT-1", "endgame", "Needs telemetry or radar tracking of the interceptor. Otherwise the figure is the vendor's claim."),
  entry("INT-2", "endgame", "Needs telemetry or radar tracking of the interceptor. Otherwise the figure is the vendor's claim."),
  entry("INT-3", "endgame", "Mapping the engagement volume needs position data for intercepts across ranges and altitudes."),
  entry("INT-6", "endgame", "Miss distance and hit point need high-speed optics and position data at closest approach."),
  entry("INT-13", "endgame", "Needs the approach angle measured at each intercept."),
  entry("INT-14", "endgame", "Needs imaging of the break-up and a ground survey of the debris field."),
  entry("11.1", "endgame", "Needs the debris, descent, and electromagnetic footprint measured against the range boundary."),
];

const NO_STANDARD_ROWS = [
  entry("1.2", "no_standard", "No public source sets a required probability of detection per UAS group."),
  entry("3a.2", "no_standard", "No public source sets a required probability of classification per UAS group."),
  entry("4.2", "no_standard", "No public source sets a required probability of weapons-quality data per UAS group."),
  entry("3.1.2", "no_standard", `${NO_PK_STANDARD} Pk is still reported in the BLUF and Performance Analysis.`),
  entry("5.4", "no_standard", `${NO_PK_STANDARD} Pk is still reported in the BLUF and Performance Analysis.`),
  entry("5.4a", "no_standard", `${NO_PK_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.4b", "no_standard", `${NO_PK_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.4c", "no_standard", `${NO_PK_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.4d", "no_standard", `${NO_PK_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.4e", "no_standard", NO_PK_STANDARD),
  entry("1.6", "no_standard", NO_COUNT_STANDARD),
  entry("2.3", "no_standard", NO_COUNT_STANDARD),
  entry("4.3", "no_standard", NO_COUNT_STANDARD),
  entry("5.2", "no_standard", NO_COUNT_STANDARD),
  entry("5.2a", "no_standard", `${NO_COUNT_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.2b", "no_standard", `${NO_COUNT_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.2c", "no_standard", `${NO_COUNT_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.2d", "no_standard", `${NO_COUNT_STANDARD} ${NOT_DIRECT_HIT}`),
  entry("5.2e", "no_standard", NO_COUNT_STANDARD),
  entry("5.3", "no_standard", "No public source sets a required number of defeats per hour at a required Pk."),
];

const NOT_APPLICABLE_ROWS = [
  entry("INT-9", "not_applicable", "A direct-hit interceptor has no fuse and no detonation."),
];

const SPECIALIST_ROWS = [
  entry("4.1.1", "specialist", "Needs a spectrum and electromagnetic compatibility test, not a range observation."),
  entry("4.1.2", "specialist", "Needs a HERO, HERP, and HERF certification review by specialists."),
  entry("5.2.1", "specialist", EW_TEST),
  entry("5.3.1", "specialist", "Meeting military safety standards is a safety board finding, not a range observation."),
  entry("7.4", "specialist", "Needs an accreditation review and a test with classified data."),
  entry("8.2", "specialist", EW_TEST),
  entry("8.3", "specialist", CYBER),
  entry("8.3a", "specialist", "Needs a supply chain review of the bill of materials."),
  entry("8.3b", "specialist", CYBER),
  entry("8.3c", "specialist", CYBER),
  entry("8.6", "specialist", "Needs a salt fog lab test, such as MIL-STD-810H Method 509."),
  entry("5.8", "specialist", "Needs program cost data the range does not hold, and no published standard sets a ceiling."),
  entry("9.3", "specialist", "Needs program labor rates the range does not hold."),
  entry("9.5", "specialist", PROGRAM_COST),
  entry("9.6", "specialist", PROGRAM_COST),
  entry("9.7", "specialist", PROGRAM_COST),
  entry("10.4", "specialist", "Free-text notes with no defined measure cannot be repeated from one evaluator to the next."),
  entry("11.2", "specialist", "Needs jamming, spoofing, and saturation emulation with a defined measure of degradation."),
  entry("11.3", "specialist", "An overall judgment across the scorecard, with no defined measure."),
];

/** Every row the evaluation does not assess, grouped by reason. */
export const NOT_ASSESSABLE = Object.freeze([
  ...GCS_ROWS,
  ...ENDGAME_ROWS,
  ...NO_STANDARD_ROWS,
  ...NOT_APPLICABLE_ROWS,
  ...SPECIALIST_ROWS,
]);

const NOT_ASSESSABLE_IDS = new Set(NOT_ASSESSABLE.map((row) => row.id));

/** @returns {boolean} True when the evaluation does not assess this row. */
export function isNotAssessable(id) {
  return NOT_ASSESSABLE_IDS.has(id);
}

/**
 * @param {object[]} rows Any records carrying an `id`.
 * @returns {object[]} The rows the evaluation still assesses.
 */
export function assessedOnly(rows) {
  return rows.filter((row) => !isNotAssessable(row.id));
}

/**
 * Keeps only assessed MOP results, and drops a criterion whose every MOP
 * is not assessed.
 *
 * @param {object[]} mopGroups Output of deriveMops.
 * @returns {object[]}
 */
export function assessedMops(mopGroups) {
  return mopGroups
    .map((group) => ({ ...group, results: assessedOnly(group.results) }))
    .filter((group) => group.results.length > 0);
}

/** Label and measure for every scorecard row, keyed by id. */
const SCORECARD_ROWS = new Map(
  C4_AREAS.flatMap((area) => area.sections.flatMap((section) => section.rows)).map((row) => [
    row.id,
    { label: row.kind === "INT" ? row.id : `${row.kind} ${row.id}`, measure: row.measure },
  ])
);

/**
 * @param {string} id A catalog, scorecard, or listed row id.
 * @returns {string} The row as it prints, such as "INT-3 Intercept Envelope".
 */
export function rowName(id) {
  const listed = NOT_ASSESSABLE.find((row) => row.id === id) || { id };
  const { label, measure } = describe(listed);
  return measure ? `${label} ${measure}` : label;
}

/** @returns {{ label: string, measure: string }} How a row prints. */
function describe(row) {
  if (row.label && row.measure) {
    return { label: row.label, measure: row.measure };
  }
  const scorecard = SCORECARD_ROWS.get(row.id);
  if (scorecard) {
    return scorecard;
  }
  const catalog = KPP_BY_ID.get(row.id);
  return { label: catalog ? catalog.label : row.id, measure: catalog ? catalog.measure : "" };
}

/**
 * Every row that is not assessed, with the label and measure it prints
 * under and its reason, grouped in reason order.
 *
 * @returns {{ key: string, title: string, summary: string, rows: object[] }[]}
 */
export function describeNotAssessable() {
  return Object.entries(NOT_ASSESSABLE_REASONS).map(([key, reason]) => ({
    key,
    title: reason.title,
    summary: reason.summary,
    rows: NOT_ASSESSABLE.filter((row) => row.reason === key).map((row) => ({
      id: row.id,
      ...describe(row),
      why: row.why,
    })),
  }));
}

/**
 * The criteria catalog as the capture screens should see it: only the rows
 * the evaluation assesses, with empty categories and sections dropped.
 *
 * @returns {{ catalog: object[], categories: object[], areas: object[] }}
 */
export function assessedCatalogView() {
  const categories = catalogByCategory()
    .map((category) => ({ ...category, entries: assessedOnly(category.entries) }))
    .filter((category) => category.entries.length > 0);
  const areas = C4_AREAS.map((area) => ({
    ...area,
    sections: area.sections
      .map((section) => ({ ...section, rows: assessedOnly(section.rows) }))
      .filter((section) => section.rows.length > 0),
  }));
  return { catalog: assessedOnly(KPP_CATALOG), categories, areas };
}
