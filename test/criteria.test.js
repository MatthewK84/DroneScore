import assert from "node:assert/strict";
import test from "node:test";
import { buildCompliance, primaryGroup, primarySystem, resolveBenchmarks } from "../server/compliance.js";
import { deriveMops, effectiveStage, flattenMops, KILL_CHAIN, stageIndex } from "../server/criteria.js";
import { catalogForTier, isKnownKppId, KPP_CATALOG } from "../server/kpp-catalog.js";
import { probabilityOfKill } from "../server/analytics.js";
import { buildMatrixCoverage } from "../server/testmatrix.js";
import { deriveBenchmarks, evaluateBenchmark, groupKinematics } from "../server/thresholds.js";

/** @returns {object} An engagement row with sensible defaults. */
function run(overrides) {
  return {
    run_type: "red_air",
    outcome: "success",
    stage_reached: null,
    identified_ok: null,
    detect_range_m: null,
    detect_alt_m: null,
    track_continuity_pct: null,
    track_error_m: null,
    id_range_m: null,
    id_time_s: null,
    engagement_range_m: null,
    time_to_intercept_s: null,
    test_profile_id: null,
    interceptor_id: 1,
    interceptor_name: "SICA",
    uas_group: "1",
    ...overrides,
  };
}

/** @returns {object} A MOP result looked up by id. */
function mopById(groups, id) {
  return flattenMops(groups).find((result) => result.id === id);
}

test("kill chain stages are ordered so a later stage implies the earlier ones", () => {
  const keys = KILL_CHAIN.map((stage) => stage.key);
  assert.deepEqual(keys, ["none", "detect", "track", "classify", "identify", "engage", "defeat"]);
  assert.ok(stageIndex("defeat") > stageIndex("engage"));
  assert.ok(stageIndex("engage") > stageIndex("identify"));
  assert.equal(stageIndex("nonsense"), -1);
});

test("a row without a captured stage is inferred from its outcome and labelled", () => {
  assert.deepEqual(effectiveStage(run({ outcome: "success" })), {
    key: "defeat",
    index: 6,
    inferred: true,
  });
  assert.equal(effectiveStage(run({ outcome: "unsuccessful" })).key, "engage");
  assert.equal(effectiveStage(run({ outcome: "not_attempted" })).key, "identify");
  assert.equal(effectiveStage(run({ stage_reached: "track" })).inferred, false);
});

test("inferred Pk matches the outcome based Pk the app already reports", () => {
  const rows = [
    run({ outcome: "success" }),
    run({ outcome: "success" }),
    run({ outcome: "unsuccessful" }),
    run({ outcome: "not_attempted" }),
  ];
  const derived = mopById(deriveMops(rows, {}, {}), "3.1.2");
  assert.equal(derived.value, probabilityOfKill(2, 3));
  assert.equal(derived.basis, "inferred from outcome");
});

test("captured stages measure each link of the chain independently", () => {
  const rows = [
    run({ stage_reached: "defeat" }),
    run({ stage_reached: "engage", outcome: "unsuccessful" }),
    run({ stage_reached: "track", outcome: "unsuccessful" }),
    run({ stage_reached: "none", outcome: "unsuccessful" }),
  ];
  const groups = deriveMops(rows, {}, {});
  assert.equal(mopById(groups, "1.1.1").value, 0.75, "three of four runs were detected");
  assert.equal(mopById(groups, "1.2.1").value, 1, "all three detections were tracked");
  assert.equal(mopById(groups, "2.1.1").value, 0.67, "two of three tracks were classified");
  assert.equal(mopById(groups, "3.1.1").value, 1, "both identified runs were engaged");
  assert.equal(mopById(groups, "3.1.2").value, 0.5, "one of two engagements defeated");
  assert.equal(mopById(groups, "3.1.2").basis, "captured");
});

test("a mixed day reports how many results were captured and how many inferred", () => {
  const rows = [run({ stage_reached: "defeat" }), run({ outcome: "success" })];
  assert.match(mopById(deriveMops(rows, {}, {}), "1.1.1").basis, /1 captured, 1 inferred/);
});

test("abort runs never enter the kill chain derivation", () => {
  const rows = [
    run({ stage_reached: "defeat" }),
    run({ run_type: "abort", stage_reached: "none", outcome: "success" }),
  ];
  assert.equal(mopById(deriveMops(rows, {}, {}), "1.1.1").value, 1);
});

test("slant range is computed from ground range and altitude, not asked for", () => {
  const rows = [run({ stage_reached: "defeat", detect_range_m: 300, detect_alt_m: 400 })];
  assert.equal(mopById(deriveMops(rows, {}, {}), "1.1.3").value.mean, 500);
});

test("mis-identification splits identification into correct and incorrect", () => {
  const rows = [
    run({ stage_reached: "identify", identified_ok: true, outcome: "not_attempted" }),
    run({ stage_reached: "identify", identified_ok: false, outcome: "not_attempted" }),
    run({ stage_reached: "defeat", identified_ok: true }),
  ];
  const groups = deriveMops(rows, {}, {});
  assert.equal(mopById(groups, "2.1.4").value, 0.33);
  assert.equal(mopById(groups, "2.1.2").value, 0.67);
});

test("day counters drive false alarm rate, MTBSA, and MTTR", () => {
  const day = { false_alarms: 6, operating_minutes: 180, system_aborts: 2, repair_minutes: 50 };
  const groups = deriveMops([run({})], day, {});
  assert.equal(mopById(groups, "1.1.4").value, 2, "six alarms across three hours");
  assert.equal(mopById(groups, "4.2.1").value, 90);
  assert.equal(mopById(groups, "4.2.2").value, 25);
});

test("missing day counters report as not entered rather than as zero", () => {
  const groups = deriveMops([run({})], {}, {});
  assert.equal(mopById(groups, "1.1.4").value, null);
  assert.equal(mopById(groups, "4.2.1").basis, "day closeout not entered");
});

test("an empty day produces no NaN anywhere in the derivation", () => {
  for (const result of flattenMops(deriveMops([], {}, {}))) {
    assert.notEqual(result.value, result.value === null ? undefined : Number.NaN);
    assert.ok(!Number.isNaN(result.value), `${result.id} produced NaN`);
  }
});

test("group kinematics are published bands, and unbounded groups say so", () => {
  assert.equal(groupKinematics("1").maxSpeedKt, 100);
  assert.equal(groupKinematics("2").maxAltitudeFt, 3500);
  assert.equal(groupKinematics("5").maxSpeedKt, null);
  assert.equal(groupKinematics("9"), null);
});

test("range benchmarks derive from closure arithmetic and show their work", () => {
  const derived = deriveBenchmarks({ uasGroup: "1", standoffM: 500, cycleS: 30, launchToDefeatS: 10 });
  const detection = derived.find((entry) => entry.kppId === "1.1");
  // 100 kt is 51.4444 m/s; 30 s of closure is 1543 m; plus 500 m standoff.
  assert.equal(detection.threshold, 2.04);
  assert.equal(detection.objective, 3.59);
  assert.equal(detection.unit, "km");
  assert.match(detection.basis, /100 kt/);
  assert.match(detection.basis, /Threshold allows one cycle, Objective two/);
});

test("effectiveness benchmarks are never invented", () => {
  const derived = deriveBenchmarks({ uasGroup: "1", standoffM: 500, cycleS: 30, launchToDefeatS: 10 });
  const pk = derived.find((entry) => entry.kppId === "5.4");
  assert.equal(pk.threshold, null);
  assert.equal(pk.objective, null);
  assert.equal(pk.derived, false);
  assert.match(pk.basis, /No public authoritative source/);
});

test("groups with no published speed ceiling yield no derived range", () => {
  const derived = deriveBenchmarks({ uasGroup: "5", standoffM: 500, cycleS: 30, launchToDefeatS: 10 });
  assert.equal(derived.find((entry) => entry.kppId === "1.1").threshold, null);
});

test("benchmark verdicts land correctly on the boundaries", () => {
  const benchmark = { threshold: 2, objective: 3, basis: "" };
  assert.equal(evaluateBenchmark("1.1", 1.99, benchmark).status, "short");
  assert.equal(evaluateBenchmark("1.1", 2, benchmark).status, "threshold");
  assert.equal(evaluateBenchmark("1.1", 2.99, benchmark).status, "threshold");
  assert.equal(evaluateBenchmark("1.1", 3, benchmark).status, "objective");
});

test("lower is better KPPs invert the comparison", () => {
  const benchmark = { threshold: 4, objective: 2, basis: "" };
  assert.equal(evaluateBenchmark("6.1", 5, benchmark).status, "short");
  assert.equal(evaluateBenchmark("6.1", 4, benchmark).status, "threshold");
  assert.equal(evaluateBenchmark("6.1", 2, benchmark).status, "objective");
});

test("an unset benchmark reads as not established, never as a pass", () => {
  assert.equal(evaluateBenchmark("1.1", 9, null).status, "not_established");
  assert.equal(evaluateBenchmark("1.1", 9, { threshold: null, objective: null }).status, "not_established");
  assert.equal(evaluateBenchmark("1.1", null, { threshold: 2, objective: 3 }).status, "not_measured");
});

test("benchmark resolution prefers the most specific match", () => {
  const rows = [
    { interceptor_id: null, kpp_id: "1.1", uas_group: "", threshold: 1, objective: 2, unit: "km", basis: "global" },
    { interceptor_id: null, kpp_id: "1.1", uas_group: "1", threshold: 3, objective: 4, unit: "km", basis: "group" },
    { interceptor_id: 7, kpp_id: "1.1", uas_group: "1", threshold: 5, objective: 6, unit: "km", basis: "exact" },
  ];
  assert.equal(resolveBenchmarks(rows, 7, "1").get("1.1").basis, "exact");
  assert.equal(resolveBenchmarks(rows, 9, "1").get("1.1").basis, "group");
  assert.equal(resolveBenchmarks(rows, 9, "2").get("1.1").basis, "global");
});

test("the system under test is the interceptor with the most runs", () => {
  const rows = [
    run({ interceptor_id: 1, interceptor_name: "SICA" }),
    run({ interceptor_id: 1, interceptor_name: "SICA" }),
    run({ interceptor_id: 2, interceptor_name: "REDDI" }),
  ];
  const system = primarySystem(rows);
  assert.equal(system.name, "SICA");
  assert.deepEqual(system.others, ["REDDI"]);
  assert.equal(primaryGroup(rows), "1");
});

test("compliance covers every catalog entry and marks unmeasured ones plainly", () => {
  const rows = [run({ stage_reached: "defeat", engagement_range_m: 2200 })];
  const groups = deriveMops(rows, {}, {});
  const benchmarks = new Map([["5.1", { kppId: "5.1", threshold: 2, objective: 3, basis: "derived" }]]);
  const table = buildCompliance(groups, {}, {}, benchmarks);
  assert.equal(table.length, KPP_CATALOG.length);
  const defeatRange = table.find((entry) => entry.id === "5.1");
  assert.equal(defeatRange.measured, 2.2, "2200 m converts to 2.2 km");
  assert.equal(defeatRange.source, "MOP 3.1.3");
  assert.equal(defeatRange.status, "threshold");
  assert.equal(table.find((entry) => entry.id === "1.6").status, "not_established");
});

test("a vulnerability answer of yes is the adverse finding", () => {
  const groups = deriveMops([run({})], {}, {});
  const table = buildCompliance(groups, {}, { "8.3": "yes", "8.2": "yes" }, new Map());
  assert.equal(table.find((entry) => entry.id === "8.3").status, "short");
  assert.equal(table.find((entry) => entry.id === "8.2").status, "threshold");
});

test("matrix coverage never spreads unassigned runs across profiles", () => {
  const profiles = [
    { id: 1, code: "R-1", dataPointsRequired: 3, targets: [] },
    { id: 2, code: "F-2", dataPointsRequired: 3, targets: [] },
  ];
  const rows = [
    run({ test_profile_id: 1 }),
    run({ test_profile_id: 1 }),
    run({ test_profile_id: 1 }),
    run({ test_profile_id: 2 }),
    run({ test_profile_id: null }),
  ];
  const coverage = buildMatrixCoverage(profiles, rows);
  assert.equal(coverage.rows[0].status, "complete");
  assert.equal(coverage.rows[1].status, "short");
  assert.equal(coverage.rows[1].remaining, 2);
  assert.equal(coverage.unassigned, 1);
  assert.equal(coverage.complete, 1);
});

test("the catalog is well formed and free of duplicate ids", () => {
  const ids = KPP_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate KPP ids would collide in storage");
  for (const entry of KPP_CATALOG) {
    assert.ok(entry.description.length > 0, `${entry.id} has no description`);
    assert.ok(["number", "yesno", "spec", "list"].includes(entry.input));
    assert.ok(["system", "day", "run"].includes(entry.tier));
  }
  assert.ok(isKnownKppId("5.4e"));
  assert.equal(isKnownKppId("99.9"), false);
  assert.ok(catalogForTier("system").length > 40);
});
