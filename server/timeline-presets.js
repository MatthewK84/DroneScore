/**
 * Preset catalog for the timeline-budget profile.
 *
 * Data only. One entry per DroneScore catalog or scorecard row id. The
 * ids and units match kpp-catalog.js and c4.js as of commit dd6e14b.
 *
 * source:
 *   derived      computed from TimelineParams by timeline-profile.js
 *   judgment     analyst recommendation; never part of a bulk derived apply
 *   requirement  narrative requirement for a spec or list row; not scored
 *   not_covered  the timeline profile sets no value; existing behavior holds
 *
 * direction:
 *   higher | lower   numeric rows
 *   yes | no         Y/N rows; the favorable answer
 *   null             spec, list, and not-covered rows
 *
 * Y/N rows carry "required" or "not_required" for each level.
 * payload: null applies to every system; otherwise the row applies only
 *   when the system under test carries that defeat payload.
 */

/** Defeat payload types the UI offers as a multi-select. */
export const PAYLOAD_TYPES = Object.freeze([
  "ew_takeover",
  "rf_narrowband",
  "laser",
  "directed_energy",
  "kinetic",
]);

/** Payloads selected by default for a non-kinetic interceptor. */
export const NON_KINETIC_DEFAULT = Object.freeze(["ew_takeover", "rf_narrowband"]);

const PK_BASIS =
  "Analyst recommendation, not an authoritative source. Report the lower 80% " +
  "one-sided confidence bound. A zero-failure demonstration needs 16 trials at 90% " +
  "and 32 at 95%. Define soft and hard kill before the event.";

const PROB_BASIS =
  "Analyst recommendation, not an authoritative source. Report the lower 80% " +
  "one-sided confidence bound. A zero-failure demonstration needs 16 trials at 90% " +
  "and 32 at 95%.";

const NO_TIMELINE_LINK = "The timeline profile sets no value here. Existing behavior is unchanged.";

/** @returns {object} A derived numeric row. */
function derived(id, section, measure, units, direction, derivation, basis, payload = null) {
  return { id, section, measure, units, input: "number", direction, source: "derived", derivation, threshold: null, objective: null, basis, payload };
}

/** @returns {object} A judgment numeric row with static values. */
function judgment(id, section, measure, units, direction, values, basis, payload = null) {
  return { id, section, measure, units, input: "number", direction, source: "judgment", derivation: null, threshold: values[0], objective: values[1], basis, payload };
}

/** @returns {object} A Y/N row. */
function yesNo(id, section, measure, favorable, levels, basis) {
  return { id, section, measure, units: "Y/N", input: "yesno", direction: favorable, source: "judgment", derivation: null, threshold: levels[0], objective: levels[1], basis, payload: null };
}

/** @returns {object} A spec or list row carrying requirement text only. */
function requirement(id, section, measure, basis) {
  return { id, section, measure, units: "Spec.", input: "spec", direction: null, source: "requirement", derivation: null, threshold: null, objective: null, basis, payload: null };
}

/** @returns {object} A row the profile leaves alone. */
function notCovered(id, section, measure, basis = NO_TIMELINE_LINK, payload = null) {
  return { id, section, measure, units: "", input: "number", direction: null, source: "not_covered", derivation: null, threshold: null, objective: null, basis, payload };
}

const R = "required";
const NR = "not_required";

const DETECT = [
  derived("1.1", "4.2.1 Detect", "Range", "km", "higher", "range:detect", "Standoff plus closure at the design speed over the whole budget."),
  judgment("1.2", "4.2.1 Detect", "Accuracy (Pd)", "%", "higher", [90, 95], PROB_BASIS),
  derived("1.3", "4.2.1 Detect", "Field of View", "deg", "higher", "angle:elevationAtDefeat", "Stored value is the upper elevation limit. Full 360 deg azimuth, or the full defended sector, is required at both levels. Elevation is the angle to a group-ceiling target at the defeat point, rounded up to 5 deg."),
  judgment("1.4", "4.2.1 Detect", "Min Altitude", "m", "lower", [30, 5], "Threshold matches the 100 ft AGL test profile. Objective covers MDCOA terrain-masked ingress. Lower is better."),
  derived("1.5", "4.2.1 Detect", "Max Altitude", "m", "higher", "altitude:groupCeiling", "Altitude ceiling of the design threat's UAS group."),
  derived("1.6", "4.2.1 Detect", "Quantity", "#", "higher", "count:simultaneous", "Raid size of the design scenario. Three matches the M-1 and M-2 test profiles."),
  yesNo("1.7", "4.2.1 Detect", "Automation", "yes", [R, R], "Track initiation inside a 5 to 15 s budget requires automation."),
  judgment("1.8", "4.2.1 Detect", "Resolution", "m", "lower", [10, 3], "Read as the minimum separation at which two targets resolve as two tracks. Lower is better."),
];

const TRACK = [
  derived("2.1", "4.2.2 Track", "Range", "km", "higher", "range:track", "Range when the track is established, held until defeat."),
  judgment("2.2", "4.2.2 Track", "Accuracy", "+/- %", "lower", [10, 5], "Speed deviation. Position error should also meet 25 m (T) and 10 m (O) 3D at the 95th percentile, which keeps the target inside a 1 deg EO/IR hand-off frame near 3 km."),
  derived("2.3", "4.2.2 Track", "Quantity", "#", "higher", "count:simultaneous", "Tracks must cover the full raid."),
  yesNo("2.4", "4.2.2 Track", "Automation", "yes", [R, R], "Maneuver awareness cannot wait on an operator inside the budget."),
  derived("2.5", "4.2.2 Track", "Update / Revisit Rate", "per sec", "higher", "rate:updateHz", "Update rate in Hz, rounded up, that holds target movement between updates under maxTrackMoveM."),
];

const IDENTIFY = [
  derived("3a.1", "4.2.3 Identify", "Range (classify)", "km", "higher", "range:classify", "Range when classification completes."),
  judgment("3a.2", "4.2.3 Identify", "Accuracy (classify)", "%", "higher", [90, 95], PROB_BASIS),
  yesNo("3a.3", "4.2.3 Identify", "Automation (classify)", "yes", [NR, R], "An operator can classify inside 20 s. A 5 s window requires automated fusion."),
  derived("3b.1", "4.2.3 Identify", "Range (identify)", "km", "higher", "range:identify", "Range when type and model identification completes."),
  yesNo("3b.2", "4.2.3 Identify", "Automation (identify)", "yes", [NR, R], "An operator can identify inside 30 s. A 10 s window requires automated fusion."),
];

const TARGET_QUALITY = [
  derived("4.1", "4.2.4 Target Quality", "Range", "km", "higher", "range:identify", "Weapons-quality data completes with identification."),
  judgment("4.2", "4.2.4 Target Quality", "Accuracy", "%", "higher", [90, 95], PROB_BASIS),
  derived("4.3", "4.2.4 Target Quality", "Quantity", "#", "higher", "count:simultaneous", "Weapons-quality data for the full raid."),
  yesNo("4.5", "4.2.4 Target Quality", "Automation", "yes", [NR, R], "An operator can build weapons-quality data inside 30 s but not 10 s."),
];

const DEFEAT = [
  derived("5.1", "4.2.5 Defeat", "Range", "km", "higher", "range:engage", "Range at the engage command, which is the reach the effector needs. Defeat must still complete outside the standoff."),
  derived("5.2", "4.2.5 Defeat", "Quantity (Simultaneous)", "#", "higher", "count:simultaneous", "Simultaneous means defeated inside the effect phase. System level, all effectors combined."),
  judgment("5.2a", "4.2.5 Defeat", "Quantity (EW takeover)", "#", "higher", [1, 3], "Analyst recommendation.", "ew_takeover"),
  judgment("5.2b", "4.2.5 Defeat", "Quantity (narrowband RF)", "#", "higher", [3, 10], "Analyst recommendation.", "rf_narrowband"),
  judgment("5.2c", "4.2.5 Defeat", "Quantity (laser, per 60 s)", "#", "higher", [3, 6], "Analyst recommendation.", "laser"),
  judgment("5.2d", "4.2.5 Defeat", "Quantity (directed energy)", "#", "higher", [3, 10], "Analyst recommendation.", "directed_energy"),
  judgment("5.2e", "4.2.5 Defeat", "Quantity (kinetic)", "#", "higher", [3, 6], "Analyst recommendation.", "kinetic"),
  derived("5.3", "4.2.5 Defeat", "Quantity (Over Time)", "#/hour", "higher", "throughput:perHour", "Single-channel floor: 3600 s divided by the budget."),
  judgment("5.4", "4.2.5 Defeat", "Effectiveness (Pk)", "%", "higher", [80, 90], PK_BASIS),
  judgment("5.4a", "4.2.5 Defeat", "Effectiveness (EW takeover)", "%", "higher", [80, 90], PK_BASIS, "ew_takeover"),
  judgment("5.4b", "4.2.5 Defeat", "Effectiveness (narrowband RF)", "%", "higher", [80, 90], PK_BASIS, "rf_narrowband"),
  judgment("5.4c", "4.2.5 Defeat", "Effectiveness (laser)", "%", "higher", [80, 90], PK_BASIS, "laser"),
  judgment("5.4d", "4.2.5 Defeat", "Effectiveness (directed energy)", "%", "higher", [80, 90], PK_BASIS, "directed_energy"),
  judgment("5.4e", "4.2.5 Defeat", "Effectiveness (kinetic)", "%", "higher", [80, 90], PK_BASIS, "kinetic"),
  derived("5.5", "4.2.5 Defeat", "Launcher Capacity", "Qty", "higher", "capacity:launcher", "Simultaneous targets times shots per target, which supports shoot-look-shoot."),
  derived("5.5b", "4.2.5 Defeat", "Cyclic Rate", "rounds/minute", "higher", "rate:engagementsPerMinute", "Engagements per minute one effector must sustain to service its sequential targets inside the effect phase."),
  judgment("5.6", "4.2.5 Defeat", "Engagements per Interceptor", "Qty", "higher", [1, 2], "Objective prefers a recoverable or reusable interceptor."),
  yesNo("5.7", "4.2.5 Defeat", "Collateral Effects / Damage", "yes", [R, R], "Objective also expects a quantified debris and RF footprint in the report."),
  derived("5.8", "4.2.5 Defeat", "Cost per Engagement", "$", "lower", "cost:exchange", "Ceiling as a multiple of threat unit cost. Enter threatUnitCostUsd to populate."),
];

const AUTOMATION = [
  judgment("6.1", "4.2.6 Automation", "Workload (operate)", "# ppl", "lower", [2, 1], "A 10 s decision window supports one operator only with decision aids."),
  requirement("6.2", "4.2.6 Automation", "ID recommendation", "Recommendation shown within 20 s of track (T) and 5 s (O)."),
  yesNo("6.2a", "4.2.6 Automation", "Weapons pairing", "yes", [NR, R], "Manual pairing fits a 45 s decision window but not 10 s."),
  yesNo("6.2b", "4.2.6 Automation", "Engagement zone", "yes", [R, R], "The timeline is defined by zones, so both levels need it."),
  yesNo("6.2c", "4.2.6 Automation", "Time to intercept", "yes", [R, R], "Operators must see remaining budget at both levels."),
  yesNo("6.2d", "4.2.6 Automation", "Engagement success", "yes", [NR, R], "Assessment drops from 10 s to 5 s."),
  yesNo("6.2e", "4.2.6 Automation", "Collateral effects", "yes", [R, R], "Threshold shows restricted sectors. Objective shows a predicted footprint."),
  yesNo("6.2f", "4.2.6 Automation", "Sensor fusion", "yes", [NR, R], "A 5 s classify window requires fusion."),
  yesNo("6.2g", "4.2.6 Automation", "Audible alerts", "yes", [R, R], "Operators cannot watch every screen at either level."),
  judgment("6.3", "4.2.6 Automation", "Workload (setup)", "# ppl", "lower", [4, 2], "Analyst recommendation."),
];

const C2 = [
  requirement("7.1", "4.2.7 C2", "Architecture", "T: documented open interfaces and ICD. O: modular open architecture with government-owned interfaces."),
  yesNo("7.2a", "4.2.7 C2", "Sensor integration", "yes", [R, R], "Required at both levels."),
  requirement("7.2b", "4.2.7 C2", "Data integration", "T: exports tracks to a documented schema. O: conforms to the C4 common data standard."),
  requirement("7.2c", "4.2.7 C2", "Interface development", "T: vendor ICD delivered. O: government purpose rights to the interfaces."),
  judgment("7.3", "4.2.7 C2", "Common Operating Picture", "#", "lower", [2, 1], "Fewer displays shorten the decision phase."),
  yesNo("7.4", "4.2.7 C2", "Classification (MLS)", "yes", [NR, R], "The catalog description fixes the level at SECRET."),
  yesNo("7.5", "4.2.7 C2", "Networkability", "yes", [R, R], "Required at both levels."),
];

const SURVIVABILITY = [
  yesNo("8.1", "4.2.8 Survivability", "IP Rating", "yes", [R, R], "Threshold requires IP65. Objective requires IP67. Record the rating met."),
  yesNo("8.2", "4.2.8 Survivability", "Resilient", "yes", [R, R], "Yes only if the kill chain stays within budget under MDCOA electronic attack: 180 s (T), 60 s (O)."),
  yesNo("8.3", "4.2.8 Survivability", "Cybersecurity risk present", "no", [R, R], "No open CAT I findings."),
  yesNo("8.3a", "4.2.8 Survivability", "Component origin risk", "no", [R, R], "SBOM provided; no components from covered foreign entities."),
  yesNo("8.3b", "4.2.8 Survivability", "Unsecure network connection", "no", [R, R], "Required at both levels."),
  yesNo("8.3c", "4.2.8 Survivability", "Data handling risk", "no", [R, R], "Required at both levels."),
  derived("8.4", "4.2.8 Survivability", "Reliability (MTBSA)", "Time", "higher", "reliability:mtbsaHours", "Hours, from the no-abort probability over the mission length. Confirm the unit the day closeout scorer produces and convert."),
  requirement("8.5", "4.2.8 Survivability", "Network spec", "Document only."),
  yesNo("8.6", "4.2.8 Survivability", "Corrosion", "no", [R, R], "Favorable answer is no corrosion after MIL-STD-810H salt fog."),
  requirement("8.7", "4.2.8 Survivability", "CPU", "Document only."),
  requirement("8.8", "4.2.8 Survivability", "Hardware", "Document only."),
  requirement("8.9", "4.2.8 Survivability", "Software version", "Document only."),
  requirement("8.10", "4.2.8 Survivability", "External components", "Document only."),
  requirement("8.11", "4.2.8 Survivability", "Environmental", "Operating -20 C to +49 C (T) and -32 C to +55 C (O), tested per MIL-STD-810H."),
];

const ANCILLARY = [
  judgment("9.1", "4.2.9 Ancillary", "Battery Life", "min", "higher", [480, 1440], "One shift (T) and one full day (O)."),
  judgment("9.2", "4.2.9 Ancillary", "Weight (per component)", "kg", "lower", [40, 20], "Two-person (T) and one-person (O) lift, from the MIL-STD-1472 limits of 88 lb and 44 lb."),
  notCovered("9.3", "4.2.9 Ancillary", "Labor Cost", "Crew size (6.1) times the program labor rate."),
  judgment("9.4", "4.2.9 Ancillary", "Setup Time", "min", "lower", [60, 15], "Analyst recommendation."),
  notCovered("9.5", "4.2.10 Cost", "System Cost", "Set from the program budget."),
  notCovered("9.6", "4.2.10 Cost", "Component Cost", "Set from the program budget."),
  notCovered("9.7", "4.2.10 Cost", "Maintenance Cost", "Set from the program budget."),
];

const TLX_IDS = ["10.1", "10.1a", "10.1b", "10.1c", "10.1d", "10.1e", "10.1f"];
const USABILITY = TLX_IDS.map((id) => notCovered(id, "4.3 Usability", "NASA-TLX", "No timeline linkage and no authoritative workload ceiling."));

const USABILITY_EXTRA = [
  notCovered("10.2", "4.3 Usability", "SAGAT", "No timeline linkage and no authoritative score floor."),
  notCovered("10.3", "4.3 Usability", "System Usability Scale", "No timeline linkage and no authoritative score floor."),
  requirement("10.4", "4.3 Usability", "Cognitive Load and Decision Speed", "Decision phase stays within 45 s (T) and 10 s (O) during the M-2 multi-target profile."),
];

const MISSION_RISK = [
  requirement("11.1", "4.4 Mission Impact & Risk", "Public and Blue Force Safety", "Defeat completes outside the standoff at both levels, and the safety footprint stays inside the range boundary."),
  requirement("11.2", "4.4 Mission Impact & Risk", "Resilience to Countermeasures", "Kill chain stays within 180 s (T) and 60 s (O) under jamming, spoofing, and saturation."),
  notCovered("11.3", "4.4 Mission Impact & Risk", "Net Mission Impact", "Evaluator judgment across the full scorecard."),
];

const INT_UNCOVERED = ["INT-2", "INT-3", "INT-4", "INT-5", "INT-6", "INT-7", "INT-8", "INT-10", "INT-12", "INT-13", "INT-14"];
const INTERCEPTOR = [
  derived("INT-1", "Interceptor", "Interceptor Max Speed", "m/s", "higher", "speed:designThreat", "A tail chase closes only against a slower target. Value in m/s."),
  ...INT_UNCOVERED.map((id) => notCovered(id, "Interceptor", id)),
  notCovered("INT-9", "Interceptor", "Fuse / Detonation Performance", NO_TIMELINE_LINK, "kinetic"),
  derived("INT-11", "Interceptor", "Reload / Magazine Cycle Time", "sec", "lower", "time:cycleSeconds", "One launcher must sustain the 5.3 rate: 3600 s divided by 5.3."),
];

const MOPS = [
  judgment("1.1.4", "4.1 MOPs", "False Alarm Rate", "# / hour", "lower", [1, 0.1], "Each false track consumes up to the classify budget."),
  judgment("1.2.2", "4.1 MOPs", "Track Continuity", "%", "higher", [95, 99], "Analyst recommendation."),
  judgment("2.1.4", "4.1 MOPs", "Mis-Identification Rate", "%", "lower", [5, 2], "Analyst recommendation."),
  judgment("3.1.1", "4.1 MOPs", "Probability of Engagement", "%", "higher", [95, 99], PROB_BASIS),
  derived("3.1.4", "4.1 MOPs", "Defeat Engagement Time", "sec", "lower", "time:effectPhase", "Effect phase of the budget, engage command to defeat."),
];

/** Every preset row, in scorecard order. */
export const TIMELINE_PRESETS = Object.freeze(
  [
    ...MOPS,
    ...DETECT,
    ...TRACK,
    ...IDENTIFY,
    ...TARGET_QUALITY,
    ...DEFEAT,
    ...AUTOMATION,
    ...C2,
    ...SURVIVABILITY,
    ...ANCILLARY,
    ...USABILITY,
    ...USABILITY_EXTRA,
    ...MISSION_RISK,
    ...INTERCEPTOR,
  ].map((entry) => Object.freeze(entry))
);
