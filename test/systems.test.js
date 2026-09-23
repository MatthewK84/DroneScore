import assert from "node:assert/strict";
import test from "node:test";
import { flattenMops } from "../server/criteria.js";
import {
  assembleSystems,
  buildProgress,
  combineDayCounters,
  countUnassigned,
  partitionBySystem,
  withoutCounters,
} from "../server/systems.js";
import { assembleReview } from "../server/routes/criteria.js";

/** @returns {object} An engagement row with sensible defaults. */
function run(overrides) {
  return {
    day_id: 1,
    day_date: "2026-09-11",
    run_type: "red_air",
    outcome: "success",
    stage_reached: "defeat",
    identified_ok: true,
    detect_range_m: 3000,
    detect_alt_m: 400,
    track_continuity_pct: 95,
    track_error_m: 4,
    id_range_m: 2500,
    id_time_s: 6,
    engagement_range_m: 2200,
    time_to_intercept_s: 11,
    scenario: "mlcoa",
    interceptor_id: 1,
    interceptor_name: "KI-1",
    interceptor_profile: { "INT-1": "85" },
    uas_group: "1",
    occurred_at: "2026-09-11T14:00:00Z",
    ...overrides,
  };
}

/** @returns {object} A run flown by the second system, which misses. */
function otherRun(overrides) {
  return run({
    interceptor_id: 2,
    interceptor_name: "KI-2",
    interceptor_profile: { "INT-1": "40" },
    outcome: "unsuccessful",
    stage_reached: "engage",
    engagement_range_m: 900,
    ...overrides,
  });
}

/** @returns {object} A benchmark row as the database stores it. */
function benchmark(kppId, threshold, objective, critical) {
  return { interceptor_id: null, kpp_id: kppId, uas_group: "", threshold, objective, unit: "", basis: "test", critical: critical === true };
}

/** @returns {object} A MOP result looked up by id. */
function mopOf(pkg, id) {
  return flattenMops(pkg.mops).find((result) => result.id === id);
}

const DAY = {
  id: 1,
  day_date: "2026-09-11",
  false_alarms: 2,
  operating_minutes: 120,
  system_aborts: 1,
  repair_minutes: 20,
  operate_crew: 2,
  setup_crew: 2,
  setup_minutes: 25,
};

test("each system's MOPs come from its own runs and nobody else's", () => {
  const rows = [run({}), run({}), run({}), otherRun({})];
  const [ki1, ki2] = assembleSystems(DAY, rows, []);
  assert.equal(ki1.system.name, "KI-1");
  assert.equal(mopOf(ki1, "3.1.2").value, 1, "KI-1 defeated all three of its own engagements");
  assert.equal(mopOf(ki1, "3.1.2").n, 3, "KI-2's miss is not in KI-1's denominator");
  assert.equal(ki2.system.name, "KI-2");
  assert.equal(mopOf(ki2, "3.1.2").value, 0);
  assert.equal(mopOf(ki2, "3.1.2").n, 1);
});

test("the day review's headline package is the primary system alone", () => {
  const rows = [run({}), run({}), run({}), otherRun({})];
  const review = assembleReview(DAY, rows, [], { timezone: "UTC" });
  assert.equal(review.system.name, "KI-1");
  assert.deepEqual(review.system.others, ["KI-2"]);
  assert.equal(mopOf(review, "3.1.2").n, 3, "the headline Pk is no longer blended across systems");
  assert.equal(review.systems.length, 2);
});

test("each system is scored against its own profile, not the first one found", () => {
  const rows = [otherRun({ occurred_at: "2026-09-11T13:00:00Z" }), run({}), run({})];
  const benchmarks = [benchmark("INT-1", 60, 100)];
  const [ki1, ki2] = assembleSystems(DAY, rows, benchmarks);
  const speed = (pkg) =>
    pkg.scorecard.areas[2].sections[1].rows.find((row) => row.id === "INT-1");
  assert.equal(speed(ki1).measured, 85, "KI-1 declared 85 even though KI-2 ran first");
  assert.equal(speed(ki2).measured, 40);
  assert.equal(speed(ki2).score, 0);
});

test("day closeout counters go to the primary system only", () => {
  const rows = [run({}), run({}), otherRun({})];
  const [ki1, ki2] = assembleSystems(DAY, rows, []);
  assert.equal(ki1.countersAttributed, true);
  assert.equal(mopOf(ki1, "1.1.4").value, 1, "two alarms over two hours");
  assert.equal(ki2.countersAttributed, false);
  assert.equal(mopOf(ki2, "1.1.4").value, null, "KI-2 does not inherit KI-1's closeout");
});

test("runs with no interceptor are counted and kept out of every system", () => {
  const rows = [run({}), run({ interceptor_id: null, interceptor_name: null })];
  assert.equal(countUnassigned(rows), 1);
  const systems = partitionBySystem(rows);
  assert.equal(systems.length, 1);
  assert.equal(systems[0].rows.length, 1);
  const review = assembleReview(DAY, rows, [], { timezone: "UTC" });
  assert.equal(review.unassignedRuns, 1);
});

test("a day with no runs still yields a scorecard to render", () => {
  const review = assembleReview(DAY, [], [], { timezone: "UTC" });
  assert.deepEqual(review.systems, []);
  assert.equal(review.scorecard.total, 67);
  assert.equal(review.scorecard.overall, null);
});

test("clearing counters leaves the rest of the day intact", () => {
  const cleared = withoutCounters(DAY);
  assert.equal(cleared.false_alarms, null);
  assert.equal(cleared.setup_minutes, null);
  assert.equal(cleared.day_date, "2026-09-11");
});

test("combined closeouts sum flows over complete days and keep the latest level", () => {
  const days = [
    { ...DAY, id: 1, operate_crew: 3 },
    { ...DAY, id: 2, false_alarms: null, operating_minutes: 240, operate_crew: null },
    { ...DAY, id: 3, false_alarms: 4, operating_minutes: 180, operate_crew: 2 },
  ];
  const { counters, completeDays, partialDays } = combineDayCounters(days);
  assert.equal(completeDays, 2);
  assert.equal(partialDays, 1);
  assert.equal(counters.false_alarms, 6);
  assert.equal(counters.operating_minutes, 300, "the day with unrecorded alarms adds no hours");
  assert.equal(counters.operate_crew, 2, "the latest recorded crew size stands");
});

test("progress accumulates each system across days and records its history", () => {
  const engagements = [
    run({ day_id: 1, day_date: "2026-09-10" }),
    run({ day_id: 1, day_date: "2026-09-10", outcome: "unsuccessful", stage_reached: "engage" }),
    otherRun({ day_id: 1, day_date: "2026-09-10" }),
    run({ day_id: 2, day_date: "2026-09-11" }),
    run({ day_id: 2, day_date: "2026-09-11" }),
  ];
  const days = [
    { ...DAY, id: 1, day_date: "2026-09-10" },
    { ...DAY, id: 2, day_date: "2026-09-11" },
  ];
  const benchmarks = [benchmark("3.1.2", 60, 80, true)];
  const { systems, unassignedRuns } = buildProgress(engagements, days, benchmarks, "UTC");
  assert.equal(unassignedRuns, 0);
  const [ki1, ki2] = systems;
  assert.equal(ki1.name, "KI-1");
  assert.equal(ki1.daysFlown, 2);
  assert.equal(ki1.redAirRuns, 4);
  assert.equal(ki1.pk, 0.75, "three defeats in four engagements across both days");
  assert.equal(ki1.closeoutDays, 2, "KI-1 was primary on both days");
  assert.deepEqual(ki1.history.map((point) => point.date), ["2026-09-10", "2026-09-11"]);
  assert.equal(ki1.history[0].overall, 0, "Pk 0.50 after day one is below the 60 percent threshold");
  assert.equal(ki1.history[1].overall, 1, "Pk 0.75 by day two meets threshold");
  assert.equal(ki1.notMilitarilyEffective, false);
  assert.equal(ki2.closeoutDays, 0, "KI-2 was never the primary system");
  assert.equal(ki2.notMilitarilyEffective, true, "KI-2's only engagement missed a Critical KPP");
  assert.deepEqual(ki2.criticalFailures, [{ label: "MOP 3.1.2", measure: "Probability of Kill / Defeat (Pk)" }]);
});

test("progress reports attainment counts that reconcile with the scored rows", () => {
  const engagements = [run({}), run({})];
  const benchmarks = [benchmark("3.1.2", 60, 80), benchmark("1.1.1", 90, 99), benchmark("3.1.4", 5, 3)];
  const [ki1] = buildProgress(engagements, [DAY], benchmarks, "UTC").systems;
  const { objective, threshold, notMet } = ki1.attainment;
  assert.equal(objective + threshold + notMet, ki1.states.scored);
  assert.equal(notMet, 1, "an 11 second defeat time misses a 5 second threshold");
});

test("the public progress payload carries scores and counts, never evidence", () => {
  const engagements = [run({ notes: "Seeker broke lock against the sun." })];
  const profile = { "INT-1": "85", "mop.5.1.1": "ATO granted 2026-01-04", "8.3": "yes" };
  const benchmarks = [benchmark("3.1.2", 60, 80)];
  const payload = JSON.stringify(
    buildProgress([{ ...engagements[0], interceptor_profile: profile }], [DAY], benchmarks, "UTC")
  );
  const forbidden = [
    "ATO granted",
    "Seeker broke lock",
    '"sections"',
    '"measured":',
    '"measuredText"',
    '"basis"',
    '"notes"',
    '"source"',
    '"description"',
    "profile",
  ];
  for (const text of forbidden) {
    assert.equal(payload.includes(text), false, `public progress leaked ${text}`);
  }
});
