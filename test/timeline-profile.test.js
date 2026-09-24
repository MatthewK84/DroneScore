import assert from "node:assert/strict";
import test from "node:test";
import { KPP_CATALOG } from "../server/kpp-catalog.js";
import { isScorecardRowId } from "../server/c4.js";
import {
  C4_ETA_60_180,
  resolveTimelinePresets,
  timelineMilestones,
  validateTimelineParams,
} from "../server/timeline-profile.js";
import { NON_KINETIC_DEFAULT, TIMELINE_PRESETS } from "../server/timeline-presets.js";

/** @returns {Map<string, object>} Resolved rows keyed by id. */
function resolveDefault(overrides = {}) {
  const result = resolveTimelinePresets({ ...C4_ETA_60_180, ...overrides }, [...NON_KINETIC_DEFAULT]);
  assert.equal(result.ok, true);
  return new Map(result.rows.map((row) => [row.id, row]));
}

/** @returns {number[]} Threshold and Objective of one row. */
function pair(rows, id) {
  const row = rows.get(id);
  return [row.threshold, row.objective];
}

test("default profile validates", () => {
  assert.deepEqual(validateTimelineParams(C4_ETA_60_180), []);
});

test("kill chain ranges match the engagement timeline analysis", () => {
  const rows = resolveDefault();
  assert.deepEqual(pair(rows, "1.1"), [3.41, 4.35]);
  assert.deepEqual(pair(rows, "2.1"), [3.21, 4.07]);
  assert.deepEqual(pair(rows, "3a.1"), [2.94, 3.79]);
  assert.deepEqual(pair(rows, "3b.1"), [2.54, 3.24]);
  assert.deepEqual(pair(rows, "4.1"), [2.54, 3.24]);
  assert.deepEqual(pair(rows, "5.1"), [1.94, 2.68]);
});

test("rate, count, and time rows derive from the budget", () => {
  const rows = resolveDefault();
  assert.deepEqual(pair(rows, "1.3"), [20, 40]);
  assert.deepEqual(pair(rows, "1.5"), [366, 1067]);
  assert.deepEqual(pair(rows, "2.5"), [1, 4]);
  assert.deepEqual(pair(rows, "5.3"), [20, 60]);
  assert.deepEqual(pair(rows, "5.5"), [6, 20]);
  assert.deepEqual(pair(rows, "5.5b"), [3, 15]);
  assert.deepEqual(pair(rows, "8.4"), [108, 468]);
  assert.deepEqual(pair(rows, "INT-1"), [13.4, 55.9]);
  assert.deepEqual(pair(rows, "INT-11"), [180, 60]);
  assert.deepEqual(pair(rows, "3.1.4"), [60, 25]);
});

test("cost row stays empty until threat cost is entered", () => {
  assert.deepEqual(pair(resolveDefault(), "5.8"), [null, null]);
  assert.deepEqual(pair(resolveDefault({ threatUnitCostUsd: 5000 }), "5.8"), [50000, 5000]);
});

test("kinetic rows are not applicable to a non-kinetic interceptor", () => {
  const rows = resolveDefault();
  assert.equal(rows.get("5.2e").applicable, false);
  assert.equal(rows.get("5.4e").applicable, false);
  assert.equal(rows.get("INT-9").applicable, false);
  assert.equal(rows.get("5.2a").applicable, true);
});

test("phase budgets that do not sum to the timeline are rejected", () => {
  const broken = {
    ...C4_ETA_60_180,
    objective: { ...C4_ETA_60_180.objective, phases: { ...C4_ETA_60_180.objective.phases, decide: 20 } },
  };
  const result = resolveTimelinePresets(broken, []);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /objective phases sum to 70 s/);
});

test("objective timeline must be shorter than threshold", () => {
  const swapped = { ...C4_ETA_60_180, objective: C4_ETA_60_180.threshold };
  assert.match(validateTimelineParams(swapped).join(" "), /must be shorter/);
});

test("every preset id is a real catalog or scorecard row", () => {
  const catalogIds = new Set(KPP_CATALOG.map((entry) => entry.id));
  const unknown = TIMELINE_PRESETS.filter((entry) => !catalogIds.has(entry.id) && !isScorecardRowId(entry.id));
  assert.deepEqual(unknown.map((entry) => entry.id), []);
});

test("every catalog row has exactly one preset", () => {
  const presetIds = TIMELINE_PRESETS.map((entry) => entry.id);
  assert.equal(new Set(presetIds).size, presetIds.length);
  const missing = KPP_CATALOG.filter((entry) => !presetIds.includes(entry.id));
  assert.deepEqual(missing.map((entry) => entry.id), []);
});

test("milestones end at the standoff for both levels", () => {
  const last = timelineMilestones(C4_ETA_60_180).filter((m) => m.milestone === "assess");
  assert.deepEqual(last.map((m) => m.rangeKm), [1, 1]);
});
