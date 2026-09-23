/**
 * JIATF 401 Common Criteria for CUAS Characterization (C4), consolidated.
 *
 * This module is the scorecard. It lays the five Core Capability Areas out
 * exactly as the consolidated criteria print them, row for row, and it
 * turns each row into a score under the document's own rules:
 *
 *   0    Not Met, below Threshold
 *   1    Met Threshold
 *   2    Met or Exceeded Objective
 *   N/A  Not applicable to this interceptor configuration
 *
 * Two rules from the document shape everything below.
 *
 * First, the Overall System Score is the weighted average of the five Core
 * Capability Areas, equal weight by default. Only rows that actually
 * carry a score contribute. A row with no benchmark or no measurement is
 * reported as such and is excluded from the average rather than counted as
 * a pass, because a silent gap in a formal evaluation reads as a pass.
 *
 * Second, any Critical KPP scored 0 flags the system "Not Militarily
 * Effective". The document does not say which KPPs are critical, and this
 * module does not guess. Criticality is declared by the evaluator on the
 * benchmark record, at the same time the Threshold and Objective are set,
 * which is when the document says those decisions are made.
 *
 * Nothing here asks the scorer for anything. Every Measured value arrives
 * from a MOP derived from logged runs, an operational-day closeout
 * counter, or the system profile, in that order of preference.
 */

import { KPP_BY_ID } from "./kpp-catalog.js";

/** Score values the document defines. */
export const SCORE_NOT_MET = 0;
export const SCORE_THRESHOLD = 1;
export const SCORE_OBJECTIVE = 2;

/**
 * Row states. Only "scored" carries a number into the area average.
 *   scored        measured and compared against a stored benchmark
 *   not_applicable  marked N/A for this interceptor configuration
 *   reported      a specification or narrative the document does not score
 *   no_benchmark  no Threshold or Objective stored, so nothing to compare
 *   not_measured  a benchmark exists but no value has been produced yet
 *   claimed       a performance figure the vendor's data sheet states and no
 *                 run has yet demonstrated; shown, never scored
 */
export const ROW_STATES = Object.freeze([
  "scored",
  "not_applicable",
  "reported",
  "no_benchmark",
  "not_measured",
  "claimed",
]);

/** Profile key prefix that marks one scorecard row Not Applicable. */
const NA_PREFIX = "na.";

/** Profile key prefix holding the Y/N or Pass/Fail verdict of a narrative MOP. */
const VERDICT_SUFFIX = ".verdict";

/**
 * @param {string} itemId
 * @returns {string} Profile key carrying the N/A mark for a row.
 */
export function naKey(itemId) {
  return `${NA_PREFIX}${itemId}`;
}

/**
 * @param {string} mopId
 * @returns {string} Profile key carrying a narrative MOP's verdict.
 */
export function verdictKey(mopId) {
  return `mop.${mopId}${VERDICT_SUFFIX}`;
}

/**
 * @param {string} mopId
 * @returns {string} Profile key carrying a narrative MOP's evidence text.
 */
export function narrativeKey(mopId) {
  return `mop.${mopId}`;
}

/**
 * A row measured from a MOP derived out of logged runs. `field` picks the
 * number off a distribution, and `scale` converts MOP units into the units
 * the criteria table prints: MOP ranges are metres where the table asks
 * for kilometres, and MOP proportions are fractions where it asks for
 * percentages.
 *
 * @param {string} id Row id as printed in the criteria table.
 * @param {string} measure Measure name as printed.
 * @param {string} units Units column as printed.
 * @param {string} description Description column as printed.
 * @param {object} from Derivation mapping.
 * @returns {object} Row definition.
 */
function derivedRow(id, measure, units, description, from) {
  return { id, kind: "MOP", measure, units, description, input: "number", from };
}

/**
 * A row whose value comes from the KPP catalog, which resolves it from a
 * MOP, a day closeout counter, or the system profile.
 *
 * @param {string} id Catalog id.
 * @param {string} kind Label prefix as printed, such as "KPP" or "KSA".
 * @param {string} measure Measure name as printed in the criteria table.
 * @param {string} units Units column as printed.
 * @param {string} description Description column as printed.
 * @returns {object} Row definition.
 */
function catalogRow(id, kind, measure, units, description) {
  return { id, kind, measure, units, description, input: null, from: { kind: "catalog" } };
}

/**
 * A row answered as a narrative on the system profile, with a Y/N or
 * Pass/Fail verdict beside it so it still scores.
 *
 * @param {string} id Row id as printed.
 * @param {string} measure Measure name as printed.
 * @param {string} units Units column as printed, "Y/N" or "Pass/Fail".
 * @param {string} description Description column as printed.
 * @returns {object} Row definition.
 */
function verdictRow(id, measure, units, description) {
  const input = units === "Pass/Fail" ? "passfail" : "yesno";
  return { id, kind: "MOP", measure, units, description, input, from: { kind: "verdict" } };
}

const CRITERION_1 = Object.freeze({
  id: "1",
  name: "Detection & Tracking",
  weight: 1,
  sections: [
    {
      title: "MOE 1.1 UAS Detection",
      rows: [
        derivedRow("1.1.1", "Probability of Detection", "%", "Proportion of hostile UAS correctly detected", { kind: "mop", mopId: "1.1.1", field: "value", scale: 100 }),
        derivedRow("1.1.2", "Detection Range (ground)", "km", "Distribution of initial detection ranges", { kind: "mop", mopId: "1.1.2", field: "mean", scale: 0.001 }),
        derivedRow("1.1.3", "Detection Range (slant)", "km", "Range and altitude of initial detection", { kind: "mop", mopId: "1.1.3", field: "mean", scale: 0.001 }),
        derivedRow("1.1.4", "False Alarm Rate", "# / hour", "False sUAS detections per unit time", { kind: "mop", mopId: "1.1.4", field: "value", scale: 1, lowerBetter: true }),
        catalogRow("1.1", "KPP", "Range", "km", "Minimum standoff detection distance"),
        catalogRow("1.2", "KPP", "Accuracy", "%", "Probability of detection at minimum range"),
        catalogRow("1.3", "KPP", "Field of View", "deg", "Coverage against the mission requirement"),
        catalogRow("1.4", "KPP", "Min Altitude", "m AGL", "Lowest detectable altitude at minimum range"),
        catalogRow("1.5", "KPP", "Max Altitude", "m AGL", "Highest detectable altitude at minimum range"),
        catalogRow("1.6", "KPP", "Quantity", "#", "Simultaneous targets of specified RCS at minimum range"),
        catalogRow("1.7", "KSA", "Automation", "Y/N", "Automatic recognition of detections as tracks"),
        catalogRow("1.8", "KPP", "Resolution", "m", "Ability to resolve standard target sizes"),
      ],
    },
    {
      title: "MOE 1.2 UAS Tracking",
      rows: [
        derivedRow("1.2.1", "Probability of Track", "%", "Detected sUAS successfully tracked", { kind: "mop", mopId: "1.2.1", field: "value", scale: 100 }),
        derivedRow("1.2.2", "Track Continuity", "%", "Time a stable track is maintained", { kind: "mop", mopId: "1.2.2", field: "mean", scale: 1 }),
        derivedRow("1.2.3", "Track Accuracy", "m (3D)", "Positional error against ground truth", { kind: "mop", mopId: "1.2.3", field: "mean", scale: 1, lowerBetter: true }),
        catalogRow("2.1", "KPP", "Range", "km", "Continuous track from the desired standoff"),
        catalogRow("2.2", "KPP", "Accuracy", "+/- %", "Deviation of reported position and speed"),
        catalogRow("2.3", "KPP", "Quantity", "#", "Simultaneous tracks of specified RCS"),
        catalogRow("2.4", "KPP", "Automation", "Y/N", "Automatic awareness of target maneuvers"),
        catalogRow("2.5", "KSA", "Update / Revisit Rate", "per sec", "Track refresh rate"),
      ],
    },
  ],
});

const CRITERION_2 = Object.freeze({
  id: "2",
  name: "Classification & Identification",
  weight: 1,
  sections: [
    {
      title: "MOE 2.1 Target Classification & Identification",
      rows: [
        derivedRow("2.1.1", "Probability of Correct Classification", "%", "Correctly classified as sUAS", { kind: "mop", mopId: "2.1.1", field: "value", scale: 100 }),
        derivedRow("2.1.2", "Probability of Correct Identification", "%", "Correct type or model", { kind: "mop", mopId: "2.1.2", field: "value", scale: 100 }),
        derivedRow("2.1.3", "Identification Range", "km", "Range of correct identification", { kind: "mop", mopId: "2.1.3", field: "mean", scale: 0.001 }),
        derivedRow("2.1.3t", "Identification Time", "sec", "Time to correct identification", { kind: "mop", mopId: "2.1.3t", field: "mean", scale: 1, lowerBetter: true }),
        derivedRow("2.1.4", "Mis-Identification Rate", "%", "Incorrectly identified", { kind: "mop", mopId: "2.1.4", field: "value", scale: 100, lowerBetter: true }),
        catalogRow("3a.1", "KPP", "Classification Range", "km", "Positive determination that the target is a sUAS"),
        catalogRow("3a.2", "KPP", "Classification Accuracy", "%", "Classification accuracy at minimum range"),
        catalogRow("3a.3", "KSA", "Automation", "Y/N", "Automated sensor fusion for classification"),
        catalogRow("3b.1", "KPP", "Identification Range", "km", "Type, make, and model identification"),
        catalogRow("3b.2", "KSA", "Automation", "Y/N", "Automated sensor fusion for specific features"),
      ],
    },
  ],
});

const CRITERION_3 = Object.freeze({
  id: "3",
  name: "Threat Defeat & Denial",
  note: "Primary focus for interceptor drones.",
  weight: 1,
  sections: [
    {
      title: "MOE 3.1 Threat Engagement & Defeat",
      rows: [
        derivedRow("3.1.1", "Probability of Engagement", "%", "Identified hostile sUAS that are engaged", { kind: "mop", mopId: "3.1.1", field: "value", scale: 100 }),
        derivedRow("3.1.2", "Probability of Kill / Defeat (Pk)", "%", "Engaged sUAS successfully defeated or denied", { kind: "mop", mopId: "3.1.2", field: "value", scale: 100 }),
        derivedRow("3.1.3", "Defeat Range", "km", "Range at successful neutralization", { kind: "mop", mopId: "3.1.3", field: "mean", scale: 0.001 }),
        derivedRow("3.1.4", "Defeat Engagement Time", "sec", "Command to successful defeat", { kind: "mop", mopId: "3.1.4", field: "mean", scale: 1, lowerBetter: true }),
        catalogRow("5.1", "KPP", "Range", "km", "Minimum weapon-to-threat defeat distance"),
        catalogRow("5.2", "KPP", "Quantity (Simultaneous)", "#", "Drones defeated simultaneously to the required Pk"),
        catalogRow("5.2e", "KPP", "Quantity (Kinetic)", "#", "Kinetic system simultaneous defeats"),
        catalogRow("5.3", "KPP", "Quantity (Over Time)", "# / hour", "Drones defeated over time to the required Pk"),
        catalogRow("5.4", "KPP", "Effectiveness (Pk)", "%", "Overall Pk, with soft and hard kills defined"),
        catalogRow("5.4e", "KPP", "Effectiveness (Kinetic)", "%", "Pk for the kinetic system"),
        catalogRow("5.5", "KPP", "Launcher Capacity", "Qty", "Rounds, magazines, or pods"),
        catalogRow("5.5b", "KPP", "Cyclic Rate", "rounds / min", "Rate of fire, or time between engagements"),
        catalogRow("5.6", "KPP", "Engagements per Interceptor", "Qty", "Ability to handle one or more simultaneous engagements"),
        catalogRow("5.7", "KSA", "Collateral Effects / Damage", "Y/N", "Within acceptable parameters"),
        catalogRow("5.8", "KPP", "Cost per Engagement", "$", "Total cost divided by successful engagements"),
      ],
    },
    {
      title: "Interceptor-Specific Metrics",
      note: "Added for kinetic interceptor drones.",
      rows: [
        catalogRow("INT-1", "INT", "Interceptor Max Speed", "m/s or kt", "Maximum speed of the interceptor drone"),
        catalogRow("INT-2", "INT", "Acceleration / G-Load", "g", "Maximum sustained acceleration and maneuverability"),
        catalogRow("INT-3", "INT", "Intercept Envelope", "km / m AGL", "Effective engagement volume, range by altitude"),
        catalogRow("INT-4", "INT", "Seeker Acquisition Range", "km", "Range at which the seeker acquires and locks the target"),
        catalogRow("INT-5", "INT", "Probability of Lock", "%", "Probability of seeker lock once inside acquisition range"),
        catalogRow("INT-6", "INT", "Terminal Guidance Accuracy (CEP)", "m", "Circular Error Probable at intercept"),
        catalogRow("INT-7", "INT", "Mid-Course Update Capability", "Y/N", "Ability to receive in-flight target updates"),
        catalogRow("INT-8", "INT", "Kill Mechanism", "Spec.", "Hit-to-kill against proximity, with lethal radius"),
        catalogRow("INT-9", "INT", "Fuse / Detonation Performance", "% / m", "Proximity fuse reliability and lethal radius"),
        catalogRow("INT-10", "INT", "Multi-Interceptor Coordination", "Y/N or #", "Coordination of multiple interceptors against one or more threats"),
        catalogRow("INT-11", "INT", "Reload / Magazine Cycle Time", "sec / min", "Time to reload or prepare the next interceptor"),
        catalogRow("INT-12", "INT", "Abort / Self-Destruct Capability", "Y/N", "Safe abort or self-destruct function"),
        catalogRow("INT-13", "INT", "Engagement Geometry Performance", "%", "Pk under head-on, tail-chase, crossing, and high-aspect geometries"),
        catalogRow("INT-14", "INT", "Debris Characterization", "Spec. / m", "Kinetic debris field size, energy, and risk footprint"),
      ],
    },
  ],
});

const CRITERION_4 = Object.freeze({
  id: "4",
  name: "System Interoperability & Reliability",
  weight: 1,
  sections: [
    {
      title: "MOE 4.1 Electromagnetic Compatibility",
      rows: [
        verdictRow("4.1.1", "Impact on Co-located Systems", "Pass/Fail", "Frequency, power, and modality effects"),
        verdictRow("4.1.2", "HERO / HERP / HERF", "Pass/Fail", "Hazards to ordnance, personnel, and fuel"),
      ],
    },
    {
      title: "MOE 4.2 System Reliability & Maintainability",
      rows: [
        derivedRow("4.2.1", "MTBSA", "min", "Mean Time Between System Abort", { kind: "mop", mopId: "4.2.1", field: "value", scale: 1 }),
        derivedRow("4.2.2", "MTTR", "min", "Mean Time to Repair, excluding administrative and logistics delay", { kind: "mop", mopId: "4.2.2", field: "value", scale: 1, lowerBetter: true }),
      ],
    },
  ],
});

const CRITERION_5 = Object.freeze({
  id: "5",
  name: "Operational Viability",
  weight: 1,
  sections: [
    {
      title: "MOE 5.1 - 5.3 Operational Viability",
      rows: [
        verdictRow("5.1.1", "RMF Compliance", "Y/N", "ATO and ATC received"),
        verdictRow("5.2.1", "Contested Environment Operation", "Y/N", "No degradation from threat electronic warfare"),
        verdictRow("5.3.1", "Hazard Prevention", "Pass/Fail", "Meets military safety standards"),
        verdictRow("5.3.2", "Collateral Damage Mitigation", "Y/N", "Restricted firing sectors exchanged with C2"),
      ],
    },
  ],
});

/** The five Core Capability Areas, in the order the criteria print them. */
export const C4_AREAS = Object.freeze([
  CRITERION_1,
  CRITERION_2,
  CRITERION_3,
  CRITERION_4,
  CRITERION_5,
]);

/**
 * Supporting KPP groups, operator usability, and mission impact. The
 * criteria carry these outside the five Core Capability Areas, so they are
 * reported in full and never folded into the Overall System Score.
 */
export const C4_SUPPORTING = Object.freeze([
  { section: "4", name: "Automation KPPs", category: "Automation" },
  { section: "4", name: "C2 KPPs", category: "C2" },
  { section: "4", name: "Survivability KPPs", category: "Survivability" },
  { section: "4", name: "Ancillary & Cost KPPs", category: "Ancillary & Cost" },
  { section: "4", name: "Target Quality KPPs", category: "Target Quality" },
  { section: "5", name: "Operator & System Usability", category: "Operator & System Usability" },
  { section: "6", name: "Mission Impact & Risk Assessment", category: "Mission Impact & Risk" },
]);

/** Every row id the scorecard can carry a benchmark for. */
const SCORECARD_ROW_IDS = Object.freeze(
  C4_AREAS.flatMap((area) => area.sections.flatMap((section) => section.rows.map((row) => row.id)))
);

/** @returns {boolean} True when the id names a row in a Core Capability Area. */
export function isScorecardRowId(id) {
  return typeof id === "string" && SCORECARD_ROW_IDS.includes(id);
}

/** @returns {boolean} True for any key the system profile may store. */
export function isNaKey(key) {
  if (typeof key !== "string" || !key.startsWith(NA_PREFIX)) {
    return false;
  }
  const id = key.slice(NA_PREFIX.length);
  return isScorecardRowId(id) || KPP_BY_ID.has(id);
}

/** @returns {boolean} True for a narrative MOP verdict key. */
export function isVerdictKey(key) {
  if (typeof key !== "string" || !key.endsWith(VERDICT_SUFFIX)) {
    return false;
  }
  return SCORECARD_ROW_IDS.some((id) => verdictKey(id) === key);
}
