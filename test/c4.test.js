import assert from "node:assert/strict";
import test from "node:test";
import { buildCompliance, resolveBenchmarks } from "../server/compliance.js";
import { deriveMops, deriveTimeline, isScenarioKey } from "../server/criteria.js";
import { C4_AREAS, isNaKey, isScorecardRowId, isVerdictKey, naKey, verdictKey } from "../server/c4.js";
import { buildScorecard } from "../server/c4-score.js";
import { KPP_BY_ID } from "../server/kpp-catalog.js";

/** @returns {object} An engagement row with sensible defaults. */
function run(overrides) {
  return {
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
    detect_time_s: null,
    decide_time_s: null,
    scenario: "mlcoa",
    interceptor_id: 1,
    uas_group: "1",
    ...overrides,
  };
}

/** @returns {object} A benchmark row as the database stores it. */
function benchmark(kppId, threshold, objective, critical) {
  return {
    interceptor_id: null,
    kpp_id: kppId,
    uas_group: "",
    threshold,
    objective,
    unit: "",
    basis: "test",
    critical: critical === true,
  };
}

/**
 * @param {object[]} rows Engagement rows.
 * @param {object[]} benchmarkRows Benchmark rows.
 * @param {object} profile System profile answers.
 * @param {object} day Day closeout counters.
 * @returns {object} The scorecard those inputs produce.
 */
function scorecardOf(rows, benchmarkRows, profile, day) {
  const answers = profile || {};
  const counters = day || {};
  const mops = deriveMops(rows, counters, answers);
  const benchmarks = resolveBenchmarks(benchmarkRows, 1, "1");
  const compliance = buildCompliance(mops, counters, answers, benchmarks);
  return buildScorecard(mops, compliance, answers, benchmarks);
}

/** @returns {object} One scorecard row looked up by id. */
function rowById(scorecard, id) {
  return scorecard.areas
    .flatMap((area) => area.sections.flatMap((section) => section.rows))
    .find((row) => row.id === id);
}

test("the scorecard carries every row of the five Core Capability Areas", () => {
  const scorecard = scorecardOf([run({})], [], {}, {});
  assert.equal(scorecard.areas.length, 5, "the criteria define five Core Capability Areas");
  assert.equal(scorecard.total, 67);
  assert.deepEqual(
    scorecard.areas.map((area) => area.id),
    ["1", "2", "3", "4", "5"]
  );
  for (const row of ["1.1.1", "1.2.3", "2.1.4", "3.1.2", "5.8", "INT-1", "INT-14", "4.2.2", "5.3.2"]) {
    assert.ok(rowById(scorecard, row), `${row} is missing from the scorecard`);
  }
});

test("every scorecard row prints an id, a measure, a unit, and a description", () => {
  for (const area of C4_AREAS) {
    for (const section of area.sections) {
      for (const row of section.rows) {
        assert.ok(row.id.length > 0);
        assert.ok(row.measure.length > 0, `${row.id} has no measure`);
        assert.ok(row.units.length > 0, `${row.id} has no unit`);
        assert.ok(row.description.length > 0, `${row.id} has no description`);
      }
    }
  }
});

test("every catalog-sourced scorecard row names a real catalog entry", () => {
  for (const area of C4_AREAS) {
    for (const section of area.sections) {
      for (const row of section.rows.filter((entry) => entry.from.kind === "catalog")) {
        assert.ok(KPP_BY_ID.has(row.id), `${row.id} is not in the KPP catalog`);
      }
    }
  }
});

test("a derived MOP scores 0, 1, or 2 against the stored benchmark", () => {
  const rows = [run({}), run({ outcome: "unsuccessful", stage_reached: "engage" })];
  const short = scorecardOf(rows, [benchmark("3.1.2", 60, 80)], {}, {});
  assert.equal(rowById(short, "3.1.2").measured, 50, "one defeat in two engagements");
  assert.equal(rowById(short, "3.1.2").score, 0);

  const threshold = scorecardOf(rows, [benchmark("3.1.2", 40, 80)], {}, {});
  assert.equal(rowById(threshold, "3.1.2").score, 1);

  const objective = scorecardOf(rows, [benchmark("3.1.2", 20, 45)], {}, {});
  assert.equal(rowById(objective, "3.1.2").score, 2);
});

test("a row where less is better scores against the benchmark the other way", () => {
  const rows = [run({ time_to_intercept_s: 8 })];
  const scorecard = scorecardOf(rows, [benchmark("3.1.4", 20, 10)], {}, {});
  const row = rowById(scorecard, "3.1.4");
  assert.equal(row.measured, 8);
  assert.equal(row.score, 2, "8 seconds beats a 10 second objective");
});

test("a row with no benchmark is reported, not scored, and stays out of the average", () => {
  const scorecard = scorecardOf([run({})], [benchmark("1.1.1", 90, 99)], {}, {});
  const measured = rowById(scorecard, "1.1.2");
  assert.equal(measured.state, "no_benchmark");
  assert.equal(measured.score, null);
  assert.equal(measured.measured, 3, "3000 m converts to 3 km and is still reported");
  assert.equal(scorecard.areas[0].score, 2, "only the one benchmarked row enters the average");
  assert.equal(scorecard.areas[0].states.scored, 1);
});

test("a benchmarked row with no measurement reports no data rather than zero", () => {
  const scorecard = scorecardOf([], [benchmark("1.2.2", 80, 95)], {}, {});
  const row = rowById(scorecard, "1.2.2");
  assert.equal(row.state, "not_measured");
  assert.equal(row.score, null);
  assert.equal(scorecard.overall, null, "nothing measured means no Overall System Score");
});

test("a row marked N/A is excluded from the score entirely", () => {
  const rows = [run({})];
  const benchmarks = [benchmark("1.1.1", 90, 99)];
  const scored = scorecardOf(rows, benchmarks, {}, {});
  assert.equal(scored.areas[0].states.scored, 1);

  const excluded = scorecardOf(rows, benchmarks, { [naKey("1.1.1")]: "yes" }, {});
  const row = rowById(excluded, "1.1.1");
  assert.equal(row.state, "not_applicable");
  assert.equal(row.score, null);
  assert.equal(excluded.areas[0].score, null);
  assert.equal(excluded.states.not_applicable, 1);
});

test("the Overall System Score is the equal weighted average of the area scores", () => {
  const rows = [run({}), run({ outcome: "unsuccessful", stage_reached: "engage" })];
  const scorecard = scorecardOf(
    rows,
    [benchmark("1.1.1", 90, 99), benchmark("3.1.2", 60, 80)],
    {},
    {}
  );
  assert.equal(scorecard.areas[0].score, 2, "both runs were detected");
  assert.equal(scorecard.areas[2].score, 0, "Pk of 50 percent falls below a 60 percent threshold");
  assert.equal(scorecard.overall, 1, "two areas scored, 2 and 0, average 1");
});

test("a Critical KPP scored 0 flags the system Not Militarily Effective", () => {
  const rows = [run({}), run({ outcome: "unsuccessful", stage_reached: "engage" })];
  const clean = scorecardOf(rows, [benchmark("3.1.2", 60, 80, false)], {}, {});
  assert.equal(clean.notMilitarilyEffective, false);
  assert.deepEqual(clean.criticalFailures, []);

  const flagged = scorecardOf(rows, [benchmark("3.1.2", 60, 80, true)], {}, {});
  assert.equal(flagged.notMilitarilyEffective, true);
  assert.equal(flagged.criticalFailures.length, 1);
  assert.equal(flagged.criticalFailures[0].id, "3.1.2");
});

test("a Critical KPP that meets its threshold raises no flag", () => {
  const scorecard = scorecardOf([run({})], [benchmark("3.1.2", 60, 80, true)], {}, {});
  assert.equal(rowById(scorecard, "3.1.2").score, 2);
  assert.equal(scorecard.notMilitarilyEffective, false);
});

test("a narrative MOP scores off its verdict, never off the prose beside it", () => {
  const prose = { "mop.5.1.1": "ATO granted 2026-01-04." };
  const unanswered = scorecardOf([run({})], [], prose, {});
  assert.equal(rowById(unanswered, "5.1.1").state, "not_measured");

  const answered = scorecardOf([run({})], [], { ...prose, [verdictKey("5.1.1")]: "yes" }, {});
  const row = rowById(answered, "5.1.1");
  assert.equal(row.score, 1);
  assert.equal(row.state, "scored");
  assert.equal(row.notes, "ATO granted 2026-01-04.");

  const failed = scorecardOf([run({})], [], { [verdictKey("5.3.1")]: "fail" }, {});
  assert.equal(rowById(failed, "5.3.1").score, 0);
});

test("interceptor-specific metrics score off the system profile declaration", () => {
  const scorecard = scorecardOf([run({})], [benchmark("INT-1", 60, 100)], { "INT-1": "85" }, {});
  const row = rowById(scorecard, "INT-1");
  assert.equal(row.label, "INT-1", "the id already carries its prefix");
  assert.equal(row.measured, 85);
  assert.equal(row.score, 1);
  assert.equal(row.source, "System profile");
});

test("supporting groups are reported in full and never enter the score", () => {
  const scorecard = scorecardOf([run({})], [], {}, {});
  const names = scorecard.supporting.map((group) => group.name);
  assert.ok(names.includes("Automation KPPs"));
  assert.ok(names.includes("Ancillary & Cost KPPs"));
  assert.ok(names.includes("Operator & System Usability"));
  assert.ok(names.includes("Mission Impact & Risk Assessment"));
  const supportingIds = new Set(
    scorecard.supporting.flatMap((group) => group.rows.map((row) => row.id))
  );
  assert.equal(supportingIds.has("3.1.2"), false, "a Core Capability row is not a supporting row");
});

test("a rate taken off the day closeout does not print an invented sample size", () => {
  const day = { operating_minutes: 120, false_alarms: 2 };
  const scorecard = scorecardOf([run({})], [], {}, day);
  const row = rowById(scorecard, "1.1.4");
  assert.equal(row.measured, 1, "two alarms over two hours");
  assert.equal(row.measuredText, "1 # / hour", "the alarm count is not a sample size");
});

test("the engagement timeline splits phases by scenario and never invents a total", () => {
  const rows = [
    run({ scenario: "mlcoa", detect_time_s: 3, id_time_s: 5, time_to_intercept_s: 12 }),
    run({ scenario: "mdcoa", detect_time_s: 5, id_time_s: 9, time_to_intercept_s: 20 }),
  ];
  const timeline = deriveTimeline(rows);
  assert.equal(timeline.phases.length, 4);
  assert.equal(timeline.phases[0].mlcoa, 3);
  assert.equal(timeline.phases[0].mdcoa, 5);
  assert.equal(timeline.phases[0].delta, 2);
  assert.equal(timeline.phases[2].mlcoa, null, "no decide timing was captured");
  assert.equal(timeline.total.mlcoa, 20);
  assert.equal(timeline.total.coveredPhases.mlcoa, 3, "a total over three of four phases says so");
  assert.equal(timeline.total.phaseCount, 4);
});

test("an abort run is excluded from the timeline as it is from the kill chain", () => {
  const rows = [run({ run_type: "abort", detect_time_s: 90 }), run({ detect_time_s: 4 })];
  assert.equal(deriveTimeline(rows).phases[0].mlcoa, 4);
});

test("a run with no stated scenario counts as MLCOA rather than being dropped", () => {
  const timeline = deriveTimeline([run({ scenario: null, detect_time_s: 7 })]);
  assert.equal(timeline.phases[0].mlcoa, 7);
  assert.equal(timeline.phases[0].mdcoa, null);
  assert.equal(isScenarioKey("mdcoa"), true);
  assert.equal(isScenarioKey("other"), false);
});

test("profile and benchmark keys are recognized only for rows that exist", () => {
  assert.ok(isScorecardRowId("INT-7"));
  assert.ok(isScorecardRowId("1.1.1"));
  assert.equal(isScorecardRowId("9.9.9"), false);
  assert.ok(isNaKey(naKey("3.1.2")));
  assert.ok(isNaKey(naKey("8.3")), "a supporting KPP can also be marked not applicable");
  assert.equal(isNaKey("na.nonsense"), false);
  assert.ok(isVerdictKey(verdictKey("4.1.2")));
  assert.equal(isVerdictKey("mop.9.9.9.verdict"), false);
});
