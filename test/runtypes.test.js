import test from "node:test";
import assert from "node:assert/strict";
import { computeDayStats, isAbortRun } from "../server/analytics.js";

/** @returns {object} An engagement row for testing. */
function row(runType, outcome, extra = {}) {
  return {
    run_type: runType,
    outcome,
    time_to_intercept_s: null,
    engagement_range_m: null,
    interceptor_name: "Talon",
    drone_name: "Quad",
    uas_group: "1",
    occurred_at: "2026-07-14T15:00:00Z",
    weather: null,
    ...extra,
  };
}

test("abort runs are excluded from Pk", () => {
  const rows = [
    row("red_air", "success"),
    row("red_air", "unsuccessful"),
    row("abort", "unsuccessful"),
    row("abort", "unsuccessful"),
    row("abort", "unsuccessful"),
  ];
  const stats = computeDayStats(rows, "America/New_York");
  assert.equal(stats.totalRuns, 5);
  // Pk is 1 of 2 Red Air attempts, not 1 of 5 runs.
  assert.equal(stats.overall.attempts, 2);
  assert.equal(stats.overall.pk, 0.5);
});

test("abort runs get their own rollup", () => {
  const rows = [row("abort", "success"), row("abort", "success"), row("abort", "unsuccessful")];
  const stats = computeDayStats(rows, "America/New_York");
  assert.equal(stats.abort.total, 3);
  assert.equal(stats.abort.successes, 2);
  assert.equal(stats.abort.pk, 0.67);
  // No Red Air runs means no Pk at all, rather than a misleading zero.
  assert.equal(stats.overall.total, 0);
  assert.equal(stats.overall.pk, null);
});

test("rows without a run type count as Red Air, preserving historical numbers", () => {
  const legacy = [{ ...row("red_air", "success") }, { ...row("red_air", "unsuccessful") }];
  for (const entry of legacy) {
    delete entry.run_type;
  }
  const stats = computeDayStats(legacy, "America/New_York");
  assert.equal(stats.overall.attempts, 2);
  assert.equal(stats.overall.pk, 0.5);
  assert.equal(stats.abort.total, 0);
});

test("isAbortRun identifies only abort rows", () => {
  assert.equal(isAbortRun({ run_type: "abort" }), true);
  assert.equal(isAbortRun({ run_type: "red_air" }), false);
  assert.equal(isAbortRun({}), false);
});

test("weather summary never yields NaN when a field is missing", () => {
  const rows = [
    row("red_air", "success", { weather: { tempF: 78, description: "Cloudy" } }),
    row("red_air", "success", { weather: { tempF: 82, description: "Cloudy" } }),
  ];
  const { weather } = computeDayStats(rows, "America/New_York");
  assert.equal(weather.tempMinF, 78);
  assert.equal(weather.tempMaxF, 82);
  // windMph absent from every snapshot must read as null, never NaN.
  assert.equal(weather.windMinMph, null);
  assert.equal(weather.gustMaxMph, null);
  assert.ok(!Number.isNaN(weather.windMinMph));
});

test("weather summary reports wind and gust in mph", () => {
  const rows = [
    row("red_air", "success", { weather: { tempF: 78, windMph: 8, gustMph: 19 } }),
    row("red_air", "success", { weather: { tempF: 80, windMph: 12, gustMph: null } }),
  ];
  const { weather } = computeDayStats(rows, "America/New_York");
  assert.equal(weather.windMinMph, 8);
  assert.equal(weather.windMaxMph, 12);
  assert.equal(weather.gustMaxMph, 19);
});

test("per-interceptor rollups keep the run types apart", () => {
  const rows = [
    row("red_air", "success"),
    row("abort", "unsuccessful"),
    row("abort", "unsuccessful"),
  ];
  const stats = computeDayStats(rows, "America/New_York");
  assert.equal(stats.byInterceptor[0].attempts, 1);
  assert.equal(stats.byInterceptor[0].pk, 1);
  assert.equal(stats.abortByInterceptor[0].attempts, 2);
  assert.equal(stats.abortByInterceptor[0].pk, 0);
});
