import assert from "node:assert/strict";
import test from "node:test";
import {
  barShare,
  interceptorTallies,
  isRecent,
  newestFirst,
  outcomeView,
  slowestTti,
  splitRuns,
} from "../src/engagement-view.js";

/** @returns {object} One engagement in the API shape both pages load. */
function run(id, minute, overrides = {}) {
  return {
    id,
    runType: "red_air",
    outcome: "success",
    interceptorName: "SICA",
    droneName: "Skywalker X8",
    timeToInterceptS: 30,
    occurredAt: `2026-09-25T14:${String(minute).padStart(2, "0")}:00Z`,
    ...overrides,
  };
}

const RUNS = [
  run(3, 20, { outcome: "unsuccessful", timeToInterceptS: 55 }),
  run(1, 5),
  run(2, 10, { interceptorName: "REDDI", timeToInterceptS: 40 }),
  run(4, 25, { runType: "abort" }),
  run(5, 30, { outcome: "not_attempted", timeToInterceptS: null }),
];

test("runs split by type and come back in the order they were flown", () => {
  const { redAir, aborts } = splitRuns(RUNS);
  assert.deepEqual(redAir.map((row) => row.id), [1, 2, 3, 5]);
  assert.deepEqual(aborts.map((row) => row.id), [4]);
  assert.deepEqual(newestFirst(RUNS).map((row) => row.id), [5, 4, 3, 2, 1]);
});

test("outcomes read by run type, and an abort success is not an intercept", () => {
  assert.deepEqual(outcomeView(RUNS[0]), { kind: "bad", label: "Miss" });
  assert.deepEqual(outcomeView(RUNS[3]), { kind: "good", label: "Abort OK" });
  assert.deepEqual(outcomeView(RUNS[4]), { kind: "none", label: "No attempt" });
});

test("tallies match the report: no-attempt runs stay out of Pk and mean time counts hits", () => {
  const [sica, reddi] = interceptorTallies(splitRuns(RUNS).redAir);
  assert.equal(sica.name, "SICA");
  assert.deepEqual([sica.attempts, sica.successes, sica.pk, sica.meanTtiS], [2, 1, 0.5, 30]);
  assert.equal(sica.runs.length, 3, "the no-attempt run still shows in the dot row");
  assert.deepEqual([reddi.attempts, reddi.pk, reddi.meanTtiS], [1, 1, 40]);
});

test("time to intercept bars scale to the day's slowest run", () => {
  assert.equal(slowestTti(RUNS), 55);
  assert.equal(barShare(55, 55), 1);
  assert.equal(barShare(27.5, 55), 0.5);
  assert.equal(barShare(null, 55), 0);
  assert.equal(barShare(10, null), 0);
  assert.equal(slowestTti([run(9, 1, { timeToInterceptS: null })]), null);
});

test("a run is new for five minutes after it was logged", () => {
  const logged = Date.parse(RUNS[1].occurredAt);
  assert.equal(isRecent(RUNS[1], logged + 4 * 60 * 1000), true);
  assert.equal(isRecent(RUNS[1], logged + 6 * 60 * 1000), false);
  assert.equal(isRecent({ occurredAt: "not a time" }, logged), false);
});
