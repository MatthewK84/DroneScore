/**
 * Key Performance Parameter and Key System Attribute catalog.
 *
 * Transcribed verbatim from sections 4.2.1 through 4.2.8 of the C-sUAS
 * Capability Characterization Criteria supplied by the evaluation team, and
 * extended with the Interceptor-Specific Metrics of section 3 and the
 * supporting groups of sections 4 through 6 of the JIATF 401 Common Criteria
 * for CUAS Characterization (C4) consolidation.
 * This module is data only. It is the single source of truth for which
 * measures exist, what units they carry, and how a scorer supplies them.
 *
 * `input` drives the capture control the UI renders:
 *   number  numeric entry, benchmarked against threshold and objective
 *   yesno   Y/N answer, benchmarked as met when the answer is yes
 *   spec    free text specification, reported but never scored
 *   list    free text list, reported but never scored
 *
 * `tier` records where the answer comes from, which decides who is asked:
 *   system  a property of the system under test, answered once in Fleet
 *   day     an operational-day metric, answered once at day closeout
 *   run     derived from logged runs, never asked
 *
 * Source note: nothing here is invented to fill gaps. Every entry carries
 * the measure name, units, and description of its source table, and a
 * category the evaluation team adds later is a new entry in this array and
 * needs no schema change.
 */

/**
 * @typedef {object} KppEntry
 * @property {string} id Catalog identifier, matching the source document.
 * @property {string} category Section heading the entry belongs to.
 * @property {string} kind "KPP", "KSA", or "INT".
 * @property {string} measure Measure name from the source table.
 * @property {string} units Units column from the source table.
 * @property {"number"|"yesno"|"spec"|"list"} input Capture control to render.
 * @property {"system"|"day"|"run"} tier Where the answer comes from.
 * @property {string} description Description column from the source table.
 */

const DETECT_KPPS = [
  { id: "1.1", kind: "KPP", measure: "Range", units: "km", input: "number", tier: "system", description: "The minimum distance from desired standoff the system must detect a threat." },
  { id: "1.2", kind: "KPP", measure: "Accuracy", units: "%", input: "number", tier: "system", description: "The probability of detection of a threat at the minimum distance range." },
  { id: "1.3", kind: "KPP", measure: "Field of View", units: "deg", input: "number", tier: "system", description: "The ability to detect sufficiently greater than the mission requirement and provide sufficient coverage." },
  { id: "1.4", kind: "KPP", measure: "Min Altitude", units: "m", input: "number", tier: "system", description: "The minimum altitude (in meters) above ground level (AGL) to detect at the minimum range." },
  { id: "1.5", kind: "KPP", measure: "Max Altitude", units: "m", input: "number", tier: "system", description: "The maximum altitude (in meters) above ground level (AGL) to detect at the minimum range." },
  { id: "1.6", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "The minimum number of targets with the specified radar cross section (RCS) that can be simultaneously detected at the minimum range." },
  { id: "1.7", kind: "KSA", measure: "Automation", units: "Y/N", input: "yesno", tier: "system", description: "The system automatically recognizes detections as tracks which include velocity and movement, which is displayed visually in the C2." },
  { id: "1.8", kind: "KPP", measure: "Resolution", units: "m", input: "number", tier: "system", description: "The distance at which the sensor can resolve different standard target sizes." },
];

const TRACK_KPPS = [
  { id: "2.1", kind: "KPP", measure: "Range", units: "km", input: "number", tier: "system", description: "The minimum distance from the designated boundary to continuously track and maintain awareness of a threat from the desired standoff." },
  { id: "2.2", kind: "KPP", measure: "Accuracy", units: "+/- %", input: "number", tier: "system", description: "The percent deviation from the true position and speed of a target being tracked at range and the sensor reported position and speed." },
  { id: "2.3", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "The minimum number of targets with the specified RCS that can be simultaneously tracked within the tracking range area." },
  { id: "2.4", kind: "KPP", measure: "Automation", units: "Y/N", input: "yesno", tier: "system", description: "Does the system automatically maintain awareness of target maneuvers?" },
  { id: "2.5", kind: "KSA", measure: "Update / Revisit Rate", units: "per sec", input: "number", tier: "system", description: "The amount of time for all of the tracks to be updated and refreshed by the system." },
];

const IDENTIFY_KPPS = [
  { id: "3a.1", kind: "KPP", measure: "Range", units: "km", input: "number", tier: "system", description: "The minimum distance to determine positively that the target is a sUAS." },
  { id: "3a.2", kind: "KPP", measure: "Accuracy", units: "%", input: "number", tier: "system", description: "The probability of classification of a threat at the minimum categorization range." },
  { id: "3a.3", kind: "KSA", measure: "Automation", units: "Y/N", input: "yesno", tier: "system", description: "Does the system perform automated sensor fusion to classify the target as a sUAS?" },
  { id: "3b.1", kind: "KPP", measure: "Range", units: "km", input: "number", tier: "system", description: "The minimum distance at which the system can identify the type, make, model, or other identifying features of the sUAS." },
  { id: "3b.2", kind: "KSA", measure: "Automation", units: "Y/N", input: "yesno", tier: "system", description: "Does the system perform automated sensor fusion to identify the sUAS specific features?" },
];

const TARGET_QUALITY_KPPS = [
  { id: "4.1", kind: "KPP", measure: "Range", units: "km", input: "number", tier: "system", description: "The minimum distance from the sensor to achieve weapons-quality data on the threat." },
  { id: "4.2", kind: "KPP", measure: "Accuracy", units: "%", input: "number", tier: "system", description: "The probability of obtaining weapons-quality data at the minimum target range." },
  { id: "4.3", kind: "KSA", measure: "Quantity", units: "#", input: "number", tier: "system", description: "The number of simultaneous targets that have been categorized and identified as threat sUAS with weapons-quality information on." },
  { id: "4.5", kind: "KSA", measure: "Automation", units: "Y/N", input: "yesno", tier: "system", description: "Does the system provide weapons-quality information automatically without input from the operator?" },
];

const DEFEAT_KPPS = [
  { id: "5.1", kind: "KPP", measure: "Range", units: "km", input: "number", tier: "system", description: "The minimum distance from the weapon to defeat a sUAS threat." },
  { id: "5.2", kind: "KPP", measure: "Quantity (Simultaneous)", units: "#", input: "number", tier: "system", description: "The number of drones the system can simultaneously defeat to the Pk percentage. Simultaneous defeat means multiple UAS targets defeated in less than X seconds from a single effector." },
  { id: "5.2a", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "Number of drones an exquisite attack can simultaneously assume control." },
  { id: "5.2b", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "Number of drones a narrow band RF system can simultaneously attack." },
  { id: "5.2c", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "Number of drones a laser can defeat within a unit of time." },
  { id: "5.2d", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "Number of drones a directed energy weapon, such as a laser or high power microwave, can simultaneously defeat." },
  { id: "5.2e", kind: "KPP", measure: "Quantity", units: "#", input: "number", tier: "system", description: "Number of drones a kinetic system can simultaneously defeat." },
  { id: "5.3", kind: "KPP", measure: "Quantity (Over Time)", units: "#/hour", input: "number", tier: "system", description: "The number of drones that the system must defeat over a period of time to the Pk percentage." },
  { id: "5.4", kind: "KPP", measure: "Effectiveness", units: "%", input: "number", tier: "run", description: "The percent Pk to defeat all drones within the required minimum distance. The evaluation must define the total number of soft kills and hard kills, and must define soft and hard kill before evaluation." },
  { id: "5.4a", kind: "KPP", measure: "Effectiveness", units: "%", input: "number", tier: "system", description: "Pk of drones an exquisite attack can simultaneously assume control." },
  { id: "5.4b", kind: "KPP", measure: "Effectiveness", units: "%", input: "number", tier: "system", description: "Pk of drones a narrow band RF system can simultaneously attack." },
  { id: "5.4c", kind: "KPP", measure: "Effectiveness", units: "%", input: "number", tier: "system", description: "Pk of drones a laser can defeat within a unit of time." },
  { id: "5.4d", kind: "KPP", measure: "Effectiveness", units: "%", input: "number", tier: "system", description: "Pk of drones a directed energy weapon can simultaneously defeat." },
  { id: "5.4e", kind: "KPP", measure: "Effectiveness", units: "%", input: "number", tier: "system", description: "Pk of drones a kinetic system can simultaneously defeat." },
  { id: "5.5", kind: "KPP", measure: "Launcher Capacity", units: "Qty", input: "number", tier: "system", description: "Number of rounds. The evaluator should also note the capacity of magazines, pods, or missiles." },
  { id: "5.5b", kind: "KPP", measure: "Cyclic Rate", units: "rounds/minute", input: "number", tier: "system", description: "Rate of fire. Depending on the system the evaluator can consider other measures appropriate to the technology, such as time between engagements. Listed as a second KPP 5.5 in the source table." },
  { id: "5.6", kind: "KPP", measure: "Engagements per Interceptor", units: "Qty", input: "number", tier: "system", description: "The interceptor's ability to handle one or more engagements simultaneously. The evaluator shall note if an effector has multiple interceptors." },
  { id: "5.7", kind: "KSA", measure: "Collateral Effects / Damage", units: "Y/N", input: "yesno", tier: "system", description: "Does the system accomplish the defeat objectives while operating within the acceptable parameters of collateral effects and damage? Optionally the evaluator may classify degradation or damage by a percentage if objectively measurable." },
  { id: "5.8", kind: "KPP", measure: "Cost per Engagement", units: "$", input: "number", tier: "system", description: "Total cost divided by total number of successful engagements." },
];

const AUTOMATION_KPPS = [
  { id: "6.1", kind: "KPP", measure: "Workload", units: "# ppl", input: "number", tier: "day", description: "The number of people required to operate the system." },
  { id: "6.2", kind: "KSA", measure: "Decision Aids", units: "Spec.", input: "spec", tier: "system", description: "ID recommendation." },
  { id: "6.2a", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Weapons pairing." },
  { id: "6.2b", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Engagement zone, earliest and latest." },
  { id: "6.2c", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Time to intercept or impact." },
  { id: "6.2d", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Engagement success." },
  { id: "6.2e", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Collateral effects." },
  { id: "6.2f", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Sensor fusion." },
  { id: "6.2g", kind: "KSA", measure: "Decision Aids", units: "Y/N", input: "yesno", tier: "system", description: "Audible alerts." },
  { id: "6.3", kind: "KPP", measure: "Workload", units: "# ppl", input: "number", tier: "day", description: "The number of people required to set up the system." },
];

const C2_KPPS = [
  { id: "7.1", kind: "KPP", measure: "Architecture", units: "Spec.", input: "spec", tier: "system", description: "Open, closed, or proprietary software and integration options." },
  { id: "7.2a", kind: "KPP", measure: "Interoperability", units: "Y/N", input: "yesno", tier: "system", description: "Sensor integration." },
  { id: "7.2b", kind: "KPP", measure: "Interoperability", units: "Spec.", input: "spec", tier: "system", description: "Data integration." },
  { id: "7.2c", kind: "KPP", measure: "Interoperability", units: "Spec.", input: "spec", tier: "system", description: "Interface development." },
  { id: "7.3", kind: "KPP", measure: "Common Operating Picture", units: "#", input: "number", tier: "system", description: "The number of displays and HMI units that the operator must use to monitor and consummate an engagement." },
  { id: "7.4", kind: "KSA", measure: "Classification", units: "Y/N", input: "yesno", tier: "system", description: "Ability to ingest multi-level security data with an overall up to SECRET classification." },
  { id: "7.5", kind: "KSA", measure: "Networkability", units: "Y/N", input: "yesno", tier: "system", description: "Ability to connect systems via a network interface." },
];

const SURVIVABILITY_KPPS = [
  { id: "8.1", kind: "KPP", measure: "IP Rating", units: "Y/N", input: "yesno", tier: "system", description: "Minimum Ingress Protection code certification or rating." },
  { id: "8.2", kind: "KSA", measure: "Resilient", units: "Y/N", input: "yesno", tier: "system", description: "Ability to operate in a contested environment." },
  { id: "8.3", kind: "KSA", measure: "Vulnerability", units: "Y/N", input: "yesno", tier: "system", description: "Cybersecurity risk present." },
  { id: "8.3a", kind: "KSA", measure: "Vulnerability", units: "Y/N", input: "yesno", tier: "system", description: "Component manufacturer or place of origin." },
  { id: "8.3b", kind: "KSA", measure: "Vulnerability", units: "Y/N", input: "yesno", tier: "system", description: "Unsecure or misconfigured network connection." },
  { id: "8.3c", kind: "KSA", measure: "Vulnerability", units: "Y/N", input: "yesno", tier: "system", description: "Data handling or transfer, purposeful or accidental human interaction." },
  { id: "8.4", kind: "KPP", measure: "Reliability", units: "Time", input: "number", tier: "day", description: "Time between system failures." },
  { id: "8.5", kind: "KPP", measure: "System Spec", units: "Spec.", input: "spec", tier: "system", description: "Network, logical and physical." },
  { id: "8.6", kind: "KPP", measure: "System Spec", units: "Y/N", input: "yesno", tier: "system", description: "Corrosion." },
  { id: "8.7", kind: "KPP", measure: "System Spec", units: "Spec.", input: "spec", tier: "system", description: "CPU." },
  { id: "8.8", kind: "KPP", measure: "System Spec", units: "Spec.", input: "spec", tier: "system", description: "Hardware." },
  { id: "8.9", kind: "KPP", measure: "System Spec", units: "Version", input: "spec", tier: "system", description: "Software." },
  { id: "8.10", kind: "KPP", measure: "System Spec", units: "List", input: "list", tier: "system", description: "External components." },
  { id: "8.11", kind: "KPP", measure: "System Spec", units: "List", input: "list", tier: "system", description: "Environmental." },
];


/**
 * Interceptor-Specific Metrics. Section 3 of the JIATF 401 Common Criteria
 * for CUAS Characterization adds these to Criterion 3 for kinetic
 * interceptor drones. They are properties of the interceptor rather than
 * of any single run, so they are declared once on the system profile.
 */
const INTERCEPTOR_METRICS = [
  { id: "INT-1", kind: "INT", measure: "Interceptor Max Speed", units: "m/s or kt", input: "number", tier: "system", description: "Maximum speed of the interceptor drone." },
  { id: "INT-2", kind: "INT", measure: "Acceleration / G-Load", units: "g", input: "number", tier: "system", description: "Maximum sustained acceleration and maneuverability." },
  { id: "INT-3", kind: "INT", measure: "Intercept Envelope", units: "km / m AGL", input: "spec", tier: "system", description: "Effective engagement volume, range by altitude." },
  { id: "INT-4", kind: "INT", measure: "Seeker Acquisition Range", units: "km", input: "number", tier: "system", description: "Range at which the seeker acquires and locks the target." },
  { id: "INT-5", kind: "INT", measure: "Probability of Lock", units: "%", input: "number", tier: "system", description: "Probability of successful seeker lock once inside acquisition range." },
  { id: "INT-6", kind: "INT", measure: "Terminal Guidance Accuracy (CEP)", units: "m", input: "number", tier: "system", description: "Circular Error Probable at intercept." },
  { id: "INT-7", kind: "INT", measure: "Mid-Course Update Capability", units: "Y/N", input: "yesno", tier: "system", description: "Ability to receive in-flight target updates." },
  { id: "INT-8", kind: "INT", measure: "Kill Mechanism", units: "Spec.", input: "spec", tier: "system", description: "Hit-to-kill against proximity, with lethal radius." },
  { id: "INT-9", kind: "INT", measure: "Fuse / Detonation Performance", units: "% / m", input: "spec", tier: "system", description: "Proximity fuse reliability and lethal radius." },
  { id: "INT-10", kind: "INT", measure: "Multi-Interceptor Coordination", units: "Y/N or #", input: "yesno", tier: "system", description: "Ability to coordinate multiple interceptors against one or multiple threats." },
  { id: "INT-11", kind: "INT", measure: "Reload / Magazine Cycle Time", units: "sec / min", input: "number", tier: "system", description: "Time to reload or prepare the next interceptor." },
  { id: "INT-12", kind: "INT", measure: "Abort / Self-Destruct Capability", units: "Y/N", input: "yesno", tier: "system", description: "Safe abort or self-destruct function." },
  { id: "INT-13", kind: "INT", measure: "Engagement Geometry Performance", units: "%", input: "number", tier: "system", description: "Pk under head-on, tail-chase, crossing, and high-aspect geometries." },
  { id: "INT-14", kind: "INT", measure: "Debris Characterization", units: "Spec. / m", input: "spec", tier: "system", description: "Kinetic debris field size, energy, and risk footprint." },
];

/** Ancillary and cost measures named in section 4 of the consolidated criteria. */
const ANCILLARY_KPPS = [
  { id: "9.1", kind: "KPP", measure: "Battery Life", units: "min", input: "number", tier: "system", description: "Endurance of the system on one charge or fuel load." },
  { id: "9.2", kind: "KPP", measure: "Weight", units: "kg", input: "number", tier: "system", description: "Transported weight of the system as fielded." },
  { id: "9.3", kind: "KPP", measure: "Labor Cost", units: "$", input: "number", tier: "system", description: "Labor cost to operate the system for the evaluated period." },
  { id: "9.4", kind: "KPP", measure: "Setup Time", units: "min", input: "number", tier: "day", description: "Time from arrival to a system ready to engage." },
  { id: "9.5", kind: "KPP", measure: "System Cost", units: "$", input: "number", tier: "system", description: "Acquisition cost of one complete system." },
  { id: "9.6", kind: "KPP", measure: "Component Cost", units: "$", input: "number", tier: "system", description: "Cost of one expendable interceptor or consumable component." },
  { id: "9.7", kind: "KPP", measure: "Maintenance Cost", units: "$", input: "number", tier: "system", description: "Maintenance cost over the evaluated period." },
];

/**
 * Operator and system usability, section 5 of the consolidated criteria.
 * NASA-TLX and its subscales run 0 to 100 and a lower score is the better
 * result; SAGAT and the System Usability Scale run the other way.
 */
const USABILITY_KPPS = [
  { id: "10.1", kind: "KPP", measure: "NASA-TLX Overall", units: "0-100", input: "number", tier: "system", description: "Overall NASA Task Load Index weighted workload score." },
  { id: "10.1a", kind: "KSA", measure: "NASA-TLX Mental Demand", units: "0-100", input: "number", tier: "system", description: "Mental demand subscale." },
  { id: "10.1b", kind: "KSA", measure: "NASA-TLX Physical Demand", units: "0-100", input: "number", tier: "system", description: "Physical demand subscale." },
  { id: "10.1c", kind: "KSA", measure: "NASA-TLX Temporal Demand", units: "0-100", input: "number", tier: "system", description: "Temporal demand subscale." },
  { id: "10.1d", kind: "KSA", measure: "NASA-TLX Performance", units: "0-100", input: "number", tier: "system", description: "Perceived performance subscale." },
  { id: "10.1e", kind: "KSA", measure: "NASA-TLX Effort", units: "0-100", input: "number", tier: "system", description: "Effort subscale." },
  { id: "10.1f", kind: "KSA", measure: "NASA-TLX Frustration", units: "0-100", input: "number", tier: "system", description: "Frustration subscale." },
  { id: "10.2", kind: "KPP", measure: "SAGAT", units: "%", input: "number", tier: "system", description: "Situation Awareness Global Assessment Technique score." },
  { id: "10.3", kind: "KPP", measure: "System Usability Scale", units: "0-100", input: "number", tier: "system", description: "System Usability Scale score." },
  { id: "10.4", kind: "KSA", measure: "Cognitive Load and Decision Speed", units: "Spec.", input: "spec", tier: "system", description: "Notes on cognitive load and decision speed under multi-target and swarm conditions." },
];

/** Mission impact and risk assessment, section 6 of the consolidated criteria. */
const MISSION_IMPACT_KPPS = [
  { id: "11.1", kind: "KPP", measure: "Public and Blue Force Safety", units: "Spec.", input: "spec", tier: "system", description: "Debris, electromagnetic effects, uncontrolled descent, and safety footprints." },
  { id: "11.2", kind: "KPP", measure: "Resilience to Countermeasures", units: "Spec.", input: "spec", tier: "system", description: "Performance under jamming, spoofing, and saturation." },
  { id: "11.3", kind: "KPP", measure: "Net Mission Impact", units: "Spec.", input: "spec", tier: "system", description: "Asset protection weighed against logistical footprint and friendly interference." },
];

/** Section heading for each catalog block, in source document order. */
const CATEGORIES = Object.freeze([
  { section: "4.2.1", name: "Detect", entries: DETECT_KPPS },
  { section: "4.2.2", name: "Track", entries: TRACK_KPPS },
  { section: "4.2.3", name: "Identify and Characterize", entries: IDENTIFY_KPPS },
  { section: "4.2.4", name: "Target Quality", entries: TARGET_QUALITY_KPPS },
  { section: "4.2.5", name: "Defeat", entries: DEFEAT_KPPS },
  { section: "4.2.6", name: "Automation", entries: AUTOMATION_KPPS },
  { section: "4.2.7", name: "C2", entries: C2_KPPS },
  { section: "4.2.8", name: "Survivability", entries: SURVIVABILITY_KPPS },
  { section: "C4 3", name: "Interceptor-Specific", entries: INTERCEPTOR_METRICS },
  { section: "C4 4", name: "Ancillary & Cost", entries: ANCILLARY_KPPS },
  { section: "C4 5", name: "Operator & System Usability", entries: USABILITY_KPPS },
  { section: "C4 6", name: "Mission Impact & Risk", entries: MISSION_IMPACT_KPPS },
]);

/** @returns {KppEntry[]} Every catalog entry, flattened and tagged by category. */
function buildCatalog() {
  const flattened = [];
  for (const category of CATEGORIES) {
    for (const entry of category.entries) {
      flattened.push(
        Object.freeze({
          ...entry,
          category: category.name,
          section: category.section,
          // Interceptor metric ids already carry their own prefix: "INT-1", not "INT INT-1".
          label: entry.kind === "INT" ? entry.id : `${entry.kind} ${entry.id}`,
        })
      );
    }
  }
  return Object.freeze(flattened);
}

/** @type {readonly KppEntry[]} Every KPP and KSA, in source document order. */
export const KPP_CATALOG = buildCatalog();

/** @type {ReadonlyMap<string, KppEntry>} Catalog entries keyed by id. */
export const KPP_BY_ID = new Map(KPP_CATALOG.map((entry) => [entry.id, entry]));

/** @returns {object[]} Catalog grouped for a sectioned UI. */
export function catalogByCategory() {
  return CATEGORIES.map((category) => ({
    section: category.section,
    name: category.name,
    entries: KPP_CATALOG.filter((entry) => entry.category === category.name),
  }));
}

/**
 * @param {string} tier
 * @returns {KppEntry[]} Entries answered at the given tier.
 */
export function catalogForTier(tier) {
  return KPP_CATALOG.filter((entry) => entry.tier === tier);
}

/** @returns {boolean} True when the id names a real catalog entry. */
export function isKnownKppId(id) {
  return typeof id === "string" && KPP_BY_ID.has(id);
}
