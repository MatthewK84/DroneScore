import test from "node:test";
import assert from "node:assert/strict";
import { computeDayStats, probabilityOfKill } from "../server/analytics.js";

const ROWS = [
  {
    outcome: "success",
    time_to_intercept_s: 40,
    engagement_range_m: 800,
    interceptor_name: "SICA",
    drone_name: "Alpha",
    uas_group: "3",
    occurred_at: "2026-07-04T14:00:00Z",
    weather: null,
  },
  {
    outcome: "unsuccessful",
    time_to_intercept_s: 60,
    engagement_range_m: 500,
    interceptor_name: "REDDI",
    drone_name: "Bravo",
    uas_group: "1",
    occurred_at: "2026-07-04T15:00:00Z",
    weather: null,
  },
  {
    outcome: "not_attempted",
    time_to_intercept_s: null,
    engagement_range_m: null,
    interceptor_name: "WASP",
    drone_name: "Bravo",
    uas_group: "1",
    occurred_at: "2026-07-04T16:00:00Z",
    weather: null,
  },
];

test("Pk counts successes against attempts, excluding not_attempted", () => {
  const stats = computeDayStats(ROWS, "America/New_York");
  assert.equal(stats.overall.total, 3);
  assert.equal(stats.overall.attempts, 2);
  assert.equal(stats.overall.successes, 1);
  assert.equal(stats.overall.notAttempted, 1);
  assert.equal(stats.overall.pk, 0.5);
});

test("probabilityOfKill rounds and guards divide by zero", () => {
  assert.equal(probabilityOfKill(2, 3), 0.67);
  assert.equal(probabilityOfKill(1, 2), 0.5);
  assert.equal(probabilityOfKill(0, 0), null);
});

test("rollups group by interceptor", () => {
  const stats = computeDayStats(ROWS, "America/New_York");
  const sica = stats.byInterceptor.find((row) => row.label === "SICA");
  assert.equal(sica.successes, 1);
  assert.equal(sica.pk, 1);
});
