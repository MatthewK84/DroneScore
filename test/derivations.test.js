import assert from "node:assert/strict";
import test from "node:test";
import { deriveMops } from "../server/criteria.js";
import { crossCheck, deriveFromDeclarations, speedAdvantage } from "../server/derivations.js";
import { deriveBenchmarks } from "../server/thresholds.js";

/** @returns {object} An engagement row with sensible defaults. */
function run(overrides) {
  return {
    run_type: "red_air",
    outcome: "success",
    stage_reached: "defeat",
    identified_ok: true,
    detect_range_m: 3000,
    detect_alt_m: 400,
    engagement_range_m: 900,
    time_to_intercept_s: 12,
    ...overrides,
  };
}

/** Three defeats and one miss: four interceptors spent, Pk 0.75. */
const ROWS = [
  run({}),
  run({}),
  run({}),
  run({ outcome: "unsuccessful", stage_reached: "engage", time_to_intercept_s: 16 }),
  run({ run_type: "abort", stage_reached: null, time_to_intercept_s: 5 }),
];

/** Guardian-1's sheet, as stored after import. */
const GUARDIAN_1 = {
  "INT-1": "80.556",
  "in.cruise_speed": "44.444",
  "in.flight_time_loaded": "9",
  "in.flight_time_unloaded": "28",
  "in.working_range": "15",
  "in.max_altitude": "5000",
};

/** @returns {object} One derived value. */
function derived(profile, rows = ROWS) {
  return deriveFromDeclarations(profile, rows, deriveMops(rows, {}, profile)).values;
}

test("battery life is loaded endurance, never the unloaded figure", () => {
  const life = derived(GUARDIAN_1).get("9.1");
  assert.equal(life.value, 9);
  assert.match(life.basis, /Unloaded endurance of 28 min is not the operative figure/);
  assert.equal(life.warnings.length, 0);
});

test("loaded endurance longer than unloaded is flagged", () => {
  const life = derived({ "in.flight_time_loaded": "30", "in.flight_time_unloaded": "20" }).get("9.1");
  assert.equal(life.value, 30);
  assert.match(life.warnings[0], /exceeds unloaded/);
});

test("cost per engagement spends one interceptor per engagement, over defeats", () => {
  const cost = derived({ "9.6": "8200" }).get("5.8");
  assert.equal(cost.value, 10933.33, "$8,200 x 4 engaged / 3 defeats");
  assert.match(cost.basis, /4 interceptors expended \/ 3 defeats/);
  assert.match(cost.basis, /labor and maintenance are not included/);
});

test("cost per engagement is undefined until something is defeated", () => {
  const rows = [run({ outcome: "unsuccessful", stage_reached: "engage" })];
  const cost = derived({ "9.6": "8200" }, rows).get("5.8");
  assert.equal(cost.value, null);
  assert.match(cost.basis, /undefined until one succeeds/);
});

test("sustained defeats an hour come from readiness, engagement time, and demonstrated Pk", () => {
  const rate = derived({ "INT-11": "95" }).get("5.3");
  assert.equal(rate.value, 25, "3600 / (95 + 13) = 33.3 an hour, x 0.75 = 25.0");
  assert.match(rate.basis, /13 s mean engagement time/);
  assert.match(rate.basis, /Pk 0.75/);
});

test("a derivation missing an input returns nothing and names the input", () => {
  const values = derived({});
  assert.equal(values.get("5.3").value, null);
  assert.match(values.get("5.3").basis, /INT-11/);
  assert.equal(values.get("5.8").value, null);
  assert.match(values.get("5.8").basis, /KPP 9.6/);
  assert.equal(values.get("9.1").value, null);
  assert.equal(values.get("INT-3").value, null);
});

test("the Guardian-1 envelope is supported by its loaded endurance", () => {
  const envelope = derived(GUARDIAN_1).get("INT-3");
  assert.equal(envelope.value, "15 km radius, to 5,000 m AGL");
  assert.match(envelope.basis, /covers 24 km one way, which supports the 15 km working range/);
  assert.equal(envelope.warnings, undefined);
});

test("an envelope its endurance cannot reach is flagged", () => {
  const envelope = derived({ ...GUARDIAN_1, "in.flight_time_loaded": "3" }).get("INT-3");
  assert.match(envelope.warnings[0], /covers only 8 km one way, short of the 15 km/);
});

test("Guardian-1 outruns a Group 1 ceiling target but not a Group 2 one", () => {
  const rows = speedAdvantage(GUARDIAN_1);
  const byGroup = Object.fromEntries(rows.map((row) => [row.group, row]));
  assert.equal(byGroup["1"].margin, 29.1);
  assert.match(byGroup["1"].text, /faster by 29.1 m\/s/);
  assert.equal(byGroup["2"].margin, -48.1, "80.556 - 128.611, rounded once");
  assert.match(byGroup["2"].text, /cannot close on a target flying away/);
  assert.equal(byGroup["5"].ceiling, null);
});

test("the interceptor speed benchmark sets a Threshold and leaves the Objective to the evaluator", () => {
  const derivedBenchmarks = deriveBenchmarks({ uasGroup: "2", standoffM: 500, cycleS: 30, launchToDefeatS: 10 });
  const speed = derivedBenchmarks.find((entry) => entry.kppId === "INT-1");
  assert.equal(speed.threshold, 128.6);
  assert.equal(speed.objective, null);
  assert.equal(speed.unit, "m/s");
  assert.match(speed.basis, /Objective is left for the evaluator/);
  const unbounded = deriveBenchmarks({ uasGroup: "5", standoffM: 500, cycleS: 30, launchToDefeatS: 10 });
  assert.equal(unbounded.find((entry) => entry.kppId === "INT-1").derived, false);
});

/** @returns {object} The cross-check for one claim. */
function checkOf(profile, id, rows = ROWS, sources = {}) {
  return crossCheck(profile, sources, rows, deriveMops(rows, {}, profile)).find((entry) => entry.id === id);
}

test("a claimed level the runs fall short of is a shortfall", () => {
  const detection = checkOf({ "1.1": "5.2" }, "1.1");
  assert.equal(detection.demonstrated, 3);
  assert.equal(detection.status, "shortfall");
  assert.match(detection.note, /2.2 km below the declared level/);
  const pk = checkOf({ "5.4e": "95" }, "5.4e");
  assert.equal(pk.demonstrated, 75);
  assert.equal(pk.status, "shortfall");
});

test("a claimed level the runs meet is consistent", () => {
  assert.equal(checkOf({ "1.1": "2.5" }, "1.1").status, "consistent");
});

test("a declared reach not yet flown is not reported as a failure", () => {
  const reach = checkOf({ "in.working_range": "15" }, "in.working_range");
  assert.equal(reach.demonstrated, 0.9);
  assert.equal(reach.status, "shortfall");
  assert.match(reach.note, /not yet flown that far, not shown to fail/);
});

test("a defeat faster than the declared top speed exposes an inconsistency", () => {
  const fast = [run({ engagement_range_m: 2200, time_to_intercept_s: 11 })];
  const speed = checkOf(GUARDIAN_1, "INT-1", fast);
  assert.equal(speed.demonstrated, 200);
  assert.equal(speed.status, "inconsistent");
  assert.match(speed.note, /speed claim, a logged range, or a logged time is wrong/);
  assert.equal(checkOf(GUARDIAN_1, "INT-1").status, "consistent", "900 m in 12 s is 75 m/s, under 80.6");
});

test("claims no run can test are listed as untestable, not dropped", () => {
  const lock = checkOf({ "INT-5": "92" }, "INT-5");
  assert.equal(lock.status, "untested");
  assert.match(lock.note, /do not record seeker lock/);
});

test("each check says whether the claim came from the vendor sheet", () => {
  const sources = { "1.1": { source: "vendor-sheet" } };
  assert.equal(checkOf({ "1.1": "5.2" }, "1.1", ROWS, sources).source, "Vendor-declared");
  assert.equal(checkOf({ "1.1": "5.2" }, "1.1").source, "System profile");
});

// ---------------------------------------------------------------------------
// Through the scoring path
// ---------------------------------------------------------------------------

/** @returns {object} One system's criteria package, built as the day review builds it. */
async function packageFor(profile, sources, benchmarkRows) {
  const { assembleSystems } = await import("../server/systems.js");
  const rows = ROWS.map((row) => ({
    ...row,
    interceptor_id: 1,
    interceptor_name: "Guardian-1",
    interceptor_profile: profile,
    interceptor_profile_sources: sources,
    uas_group: "1",
  }));
  return assembleSystems({}, rows, benchmarkRows)[0];
}

/** @returns {object} A benchmark row as stored. */
function bench(kppId, threshold, objective) {
  return { interceptor_id: null, kpp_id: kppId, uas_group: "", threshold, objective, unit: "", basis: "test", critical: false };
}

/** @returns {object} A scorecard row by id. */
function rowOf(pkg, id) {
  return pkg.scorecard.areas.flatMap((area) => area.sections.flatMap((section) => section.rows)).find((row) => row.id === id);
}

test("a vendor-sheet performance claim is shown as claimed and never scored", async () => {
  const pkg = await packageFor({ "INT-5": "92" }, { "INT-5": { source: "vendor-sheet" } }, [bench("INT-5", 85, 95)]);
  const lock = rowOf(pkg, "INT-5");
  assert.equal(lock.state, "claimed");
  assert.equal(lock.score, null);
  assert.equal(lock.measuredText, "Claimed 92 %");
  assert.equal(lock.source, "Vendor-declared");
  assert.equal(pkg.scorecard.states.claimed, 1);
});

test("the same figure entered by an evaluator scores", async () => {
  const pkg = await packageFor({ "INT-5": "92" }, {}, [bench("INT-5", 85, 95)]);
  const lock = rowOf(pkg, "INT-5");
  assert.equal(lock.state, "scored");
  assert.equal(lock.score, 1);
  assert.equal(lock.source, "System profile");
});

test("a vendor-declared physical spec scores, labelled as the vendor's", async () => {
  const pkg = await packageFor({ "INT-1": "80.556" }, { "INT-1": { source: "vendor-sheet" } }, [bench("INT-1", 51.4, null)]);
  const speed = rowOf(pkg, "INT-1");
  assert.equal(speed.state, "scored");
  assert.equal(speed.score, 1);
  assert.equal(speed.source, "Vendor-declared");
});

test("derived values reach the scorecard with their arithmetic as the note", async () => {
  const pkg = await packageFor({ "9.6": "8200", "INT-11": "95" }, {}, [bench("5.8", 15000, 7500)]);
  const cost = rowOf(pkg, "5.8");
  assert.equal(cost.measured, 10933.33);
  assert.equal(cost.source, "Derived");
  assert.equal(cost.score, 1);
  assert.match(cost.notes, /4 interceptors expended \/ 3 defeats/);
  assert.equal(pkg.derivations.find((entry) => entry.id === "5.3").value, 25);
});

test("a derived value outranks a figure typed into the profile, and says so", async () => {
  const pkg = await packageFor({ "9.6": "8200", "5.8": "500" }, {}, []);
  const cost = rowOf(pkg, "5.8");
  assert.equal(cost.measured, 10933.33, "the computed cost, not the typed $500");
});

test("a derivation that lacks an input explains the gap on its row", async () => {
  const pkg = await packageFor({}, {}, [bench("5.8", 15000, 7500)]);
  const cost = rowOf(pkg, "5.8");
  assert.equal(cost.state, "not_measured");
  assert.match(cost.notes, /KPP 9.6/);
});

test("the package carries the cross-checks and the speed comparison", async () => {
  const pkg = await packageFor({ "INT-1": "80.556", "5.4e": "95" }, { "5.4e": { source: "vendor-sheet" } }, []);
  assert.equal(pkg.crossChecks.find((entry) => entry.id === "5.4e").status, "shortfall");
  assert.equal(pkg.speedAdvantage.length, 5);
});

test("a kinetic Pk claim is replaced by the Pk the runs demonstrate", async () => {
  const pkg = await packageFor({ "5.4e": "85" }, { "5.4e": { source: "vendor-sheet" } }, [bench("5.4e", 70, 85)]);
  const pk = rowOf(pkg, "5.4e");
  assert.equal(pk.state, "scored", "runs demonstrated Pk, so the claim no longer stands in");
  assert.equal(pk.measured, 75);
  assert.equal(pk.source, "MOP 3.1.2");
  assert.equal(pk.score, 1);
});
