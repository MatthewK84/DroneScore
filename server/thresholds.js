/**
 * Threshold and Objective benchmarks.
 *
 * Section 4.2 requires that a numerical Threshold and Objective be defined
 * and documented for each KPP before test execution, and that the final
 * assessment state whether the system met the Threshold, fell short, or
 * achieved the Objective. This module supplies the numbers and, more
 * importantly, the basis for every one of them.
 *
 * Two honesty rules govern this file.
 *
 * First, the DoD UAS group bands below are public and are reproduced as
 * published. They are the long-standing joint categorization; the criteria
 * document itself directs evaluators to the Department of Defense Unmanned
 * Aircraft Categorization Review Report to Congress of November 2022, and an
 * evaluation should confirm the bands against the current edition before
 * use, because a revised band silently changes every derived number here.
 *
 * Second, there is no public authoritative table of C-sUAS defeat
 * probabilities per UAS group. Any such number printed inside a formal
 * evaluation would carry the authority of a source that does not exist.
 * So effectiveness KPPs are never derived. They return no value, they say
 * why, and the report prints "not established" until an evaluator enters a
 * number together with the basis for it.
 *
 * What can be derived is geometry. A target closing at a known maximum
 * speed covers a known distance in a known time, so a required detection,
 * identification, or defeat range follows from arithmetic the report can
 * show in full.
 */

/**
 * DoD UAS group bands. Weight is maximum gross takeoff weight. Groups 1
 * and 2 state altitude above ground level; groups 3 and above state mean
 * sea level. Speed is the band ceiling, which is what a required-range
 * calculation needs.
 */
export const GROUP_KINEMATICS = Object.freeze([
  { group: "1", maxWeightLb: 20, maxAltitudeFt: 1200, altitudeRef: "AGL", maxSpeedKt: 100 },
  { group: "2", maxWeightLb: 55, maxAltitudeFt: 3500, altitudeRef: "AGL", maxSpeedKt: 250 },
  { group: "3", maxWeightLb: 1320, maxAltitudeFt: 18000, altitudeRef: "MSL", maxSpeedKt: 250 },
  { group: "4", maxWeightLb: null, maxAltitudeFt: 18000, altitudeRef: "MSL", maxSpeedKt: null },
  { group: "5", maxWeightLb: null, maxAltitudeFt: null, altitudeRef: "MSL", maxSpeedKt: null },
]);

const GROUP_SOURCE =
  "DoD UAS group bands, joint categorization. Confirm against the DoD " +
  "Unmanned Aircraft Categorization Review Report to Congress, Nov 2022.";

const METRES_PER_KT_SECOND = 0.514444;
const FEET_PER_METRE = 3.28084;

/**
 * KPPs where a smaller measured value is the better result. Cost, weight,
 * crew size, error, and elapsed time all improve as they fall; the NASA-TLX
 * subscales run the same way, where 100 is the heaviest workload. A lower
 * minimum detection altitude (1.4) and a finer resolution (1.8) are also
 * better results.
 */
const LOWER_IS_BETTER = Object.freeze([
  "1.4",
  "1.8",
  "2.2",
  "5.8",
  "6.1",
  "6.3",
  "7.3",
  "INT-6",
  "INT-11",
  "9.2",
  "9.3",
  "9.4",
  "9.5",
  "9.6",
  "9.7",
  "10.1",
  "10.1a",
  "10.1b",
  "10.1c",
  "10.1d",
  "10.1e",
  "10.1f",
]);

/** Y/N KPPs where an answer of yes is the adverse finding. */
const YES_IS_ADVERSE = Object.freeze(["8.3", "8.3a", "8.3b", "8.3c", "8.6"]);

/** @returns {object | null} The kinematic band for a group id. */
export function groupKinematics(group) {
  return GROUP_KINEMATICS.find((band) => band.group === String(group)) || null;
}

/** @returns {boolean} True when a lower measured value scores better. */
export function isLowerBetter(kppId) {
  return LOWER_IS_BETTER.includes(kppId);
}

/** @returns {boolean} True when a Y/N answer of yes is adverse. */
export function isYesAdverse(kppId) {
  return YES_IS_ADVERSE.includes(kppId);
}

/**
 * Distance a group-ceiling target covers in the given time.
 * @param {object} band
 * @param {number} seconds
 * @returns {number | null} Metres, or null when the band has no speed ceiling.
 */
function closureMetres(band, seconds) {
  if (band.maxSpeedKt === null) {
    return null;
  }
  return band.maxSpeedKt * METRES_PER_KT_SECOND * seconds;
}

/** @returns {object} A benchmark that cannot be derived, with the reason. */
function notDerivable(kppId, unit, reason) {
  return { kppId, threshold: null, objective: null, unit, basis: reason, derived: false };
}

/**
 * Range benchmark for one engagement cycle at Threshold and two at
 * Objective. One cycle means the system detects, decides, engages, and
 * defeats exactly as the target arrives at the protected standoff. Two
 * cycles means it can miss once and still re-engage before arrival.
 *
 * @param {string} kppId
 * @param {object} band
 * @param {number} standoffM
 * @param {number} cycleS
 * @param {string} what Label for the basis sentence.
 * @returns {object}
 */
function rangeBenchmark(kppId, band, standoffM, cycleS, what) {
  const perCycle = closureMetres(band, cycleS);
  if (perCycle === null) {
    return notDerivable(kppId, "km", `Group ${band.group} has no published speed ceiling, so no closure distance follows.`);
  }
  const threshold = (standoffM + perCycle) / 1000;
  const objective = (standoffM + perCycle * 2) / 1000;
  return {
    kppId,
    threshold: Math.round(threshold * 100) / 100,
    objective: Math.round(objective * 100) / 100,
    unit: "km",
    derived: true,
    basis:
      `${what}: ${standoffM} m standoff plus closure at the Group ${band.group} ` +
      `ceiling of ${band.maxSpeedKt} kt for a ${cycleS} s cycle ` +
      `(${Math.round(perCycle)} m). Threshold allows one cycle, Objective two. ${GROUP_SOURCE}`,
  };
}

/** @returns {object} Altitude ceiling benchmark straight off the group band. */
function altitudeBenchmark(kppId, band) {
  if (band.maxAltitudeFt === null) {
    return notDerivable(kppId, "m", `Group ${band.group} has no published altitude ceiling.`);
  }
  const metres = Math.round(band.maxAltitudeFt / FEET_PER_METRE);
  return {
    kppId,
    threshold: metres,
    objective: metres,
    unit: "m",
    derived: true,
    basis:
      `Group ${band.group} ceiling of ${band.maxAltitudeFt} ft ${band.altitudeRef} ` +
      `converted to ${metres} m. A sensor that cannot see the band ceiling cannot ` +
      `cover the threat. ${GROUP_SOURCE}`,
  };
}

/**
 * @param {object} band UAS group band.
 * @returns {number | null} The band's speed ceiling in metres per second,
 *   or null when the band publishes none.
 */
export function ceilingSpeedMs(band) {
  return band.maxSpeedKt === null ? null : band.maxSpeedKt * METRES_PER_KT_SECOND;
}

/**
 * Interceptor speed benchmark. A tail chase only closes if the interceptor
 * is faster than its target, so the band's speed ceiling is the Threshold.
 * How much faster is enough depends on engagement geometry that no public
 * source tabulates, so the Objective is left for the evaluator rather than
 * filled with an invented margin.
 *
 * @param {object} band
 * @returns {object}
 */
function speedBenchmark(band) {
  const ceiling = ceilingSpeedMs(band);
  if (ceiling === null) {
    return notDerivable("INT-1", "m/s", `Group ${band.group} has no published speed ceiling, so no speed benchmark follows.`);
  }
  const threshold = Math.round(ceiling * 10) / 10;
  return {
    kppId: "INT-1",
    threshold,
    objective: null,
    unit: "m/s",
    derived: true,
    basis:
      `Interceptor speed: a tail chase closes only against a slower target. Threshold is the ` +
      `Group ${band.group} ceiling of ${band.maxSpeedKt} kt (${threshold} m/s). No public source ` +
      `sets how much faster is enough, so the Objective is left for the evaluator. ${GROUP_SOURCE}`,
  };
}

const EFFECTIVENESS_KPPS = Object.freeze(["1.2", "3a.2", "4.2", "5.4", "5.4a", "5.4b", "5.4c", "5.4d", "5.4e"]);
const QUANTITY_KPPS = Object.freeze(["1.6", "2.3", "4.3", "5.2", "5.2a", "5.2b", "5.2c", "5.2d", "5.2e", "5.3"]);

const NO_PUBLIC_EFFECTIVENESS =
  "Not derived. No public authoritative source establishes a required defeat or " +
  "detection probability per UAS group, so any figure here would be invented. " +
  "An evaluator must enter the Threshold and Objective and record the basis.";

const NO_PUBLIC_QUANTITY =
  "Not derived. Simultaneous-target counts follow from the expected threat laydown " +
  "for the defended asset, not from public UAS group data. An evaluator must enter " +
  "the Threshold and Objective and record the basis.";

/**
 * @typedef {object} DerivationParams
 * @property {string} uasGroup Group id, "1" through "5".
 * @property {number} standoffM Distance from the defended asset to be held.
 * @property {number} cycleS Detect-to-defeat engagement cycle, seconds.
 * @property {number} launchToDefeatS Engage-to-defeat portion of the cycle.
 */

/**
 * Derives the benchmarks that public data supports, and states plainly
 * which ones it will not invent.
 * @param {DerivationParams} params
 * @returns {object[]} One benchmark record per KPP the framework covers.
 */
export function deriveBenchmarks(params) {
  const band = groupKinematics(params.uasGroup);
  if (band === null) {
    return [];
  }
  const cycle = params.cycleS;
  const terminal = params.launchToDefeatS;
  const derived = [
    rangeBenchmark("1.1", band, params.standoffM, cycle, "Detection range"),
    altitudeBenchmark("1.5", band),
    rangeBenchmark("2.1", band, params.standoffM, cycle, "Track range, held from first detection"),
    rangeBenchmark("3a.1", band, params.standoffM, terminal, "Classification range, before weapon release"),
    rangeBenchmark("3b.1", band, params.standoffM, terminal, "Identification range, before weapon release"),
    rangeBenchmark("4.1", band, params.standoffM, terminal, "Weapons-quality track range"),
    rangeBenchmark("5.1", band, params.standoffM, 0, "Defeat range at the protected standoff"),
    speedBenchmark(band),
  ];
  const withheld = [
    ...EFFECTIVENESS_KPPS.map((id) => notDerivable(id, "%", NO_PUBLIC_EFFECTIVENESS)),
    ...QUANTITY_KPPS.map((id) => notDerivable(id, "#", NO_PUBLIC_QUANTITY)),
  ];
  return [...derived, ...withheld];
}

/**
 * @param {number} measured
 * @param {object} benchmark
 * @returns {"objective"|"threshold"|"short"} Compliance verdict.
 */
function verdictFor(measured, benchmark) {
  const lower = isLowerBetter(benchmark.kppId);
  const meets = (limit) => (lower ? measured <= limit : measured >= limit);
  if (benchmark.objective !== null && meets(benchmark.objective)) {
    return "objective";
  }
  if (benchmark.threshold !== null && meets(benchmark.threshold)) {
    return "threshold";
  }
  return "short";
}

/**
 * Evaluates one measured value against its stored benchmark.
 * @param {string} kppId
 * @param {number | null} measured
 * @param {object | null} benchmark Stored benchmark, or null when unset.
 * @returns {object} { kppId, measured, threshold, objective, status, basis }
 */
export function evaluateBenchmark(kppId, measured, benchmark) {
  const base = { kppId, measured, threshold: null, objective: null, basis: "" };
  if (!benchmark || (benchmark.threshold === null && benchmark.objective === null)) {
    return { ...base, status: "not_established", basis: benchmark?.basis || "" };
  }
  const shaped = {
    ...base,
    threshold: benchmark.threshold,
    objective: benchmark.objective,
    basis: benchmark.basis || "",
  };
  if (measured === null || !Number.isFinite(measured)) {
    return { ...shaped, status: "not_measured" };
  }
  return { ...shaped, status: verdictFor(measured, { ...benchmark, kppId }) };
}
