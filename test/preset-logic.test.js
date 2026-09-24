import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelinePreview } from "../server/benchmark-presets.js";
import { isNotAssessable } from "../server/not-assessable.js";
import { NON_KINETIC_DEFAULT } from "../server/timeline-presets.js";
import { C4_ETA_60_180 } from "../server/timeline-profile.js";
import {
  buildItem,
  conflictsFor,
  findStored,
  formatPresetValue,
  groupBySection,
  phaseSum,
  rowStatus,
  writableBySource,
} from "../src/preset-logic.js";

const PREVIEW = buildTimelinePreview(C4_ETA_60_180, [...NON_KINETIC_DEFAULT]);

/** @returns {object} One preview row by id. */
function row(id) {
  return PREVIEW.rows.find((entry) => entry.id === id);
}

/** @returns {object} A stored benchmark in API shape at the all-systems scope. */
function stored(kppId, values) {
  return { id: 1, interceptorId: null, kppId, uasGroup: "", unit: "km", basis: "", critical: false, ...values };
}

test("a row that matches its stored benchmark reads as matching, even with a stamp", () => {
  const preset = row("5.5");
  const match = stored("5.5", { threshold: 6, objective: 20, unit: "Qty", basis: `[C4 ETA 60/180 preset: derived] ${preset.store.basis}` });
  assert.equal(rowStatus(preset, match), "matches");
  assert.equal(rowStatus(preset, stored("5.5", { threshold: 3, objective: 4, unit: "Qty" })), "differs");
  assert.equal(rowStatus(preset, null), "not_stored");
});

test("inapplicable, uncovered, and unpopulated rows are never writable", () => {
  assert.equal(rowStatus({ ...row("5.5"), applicable: false }, null), "na");
  assert.equal(rowStatus(row("10.1"), null), "not_covered");
  assert.equal(rowStatus({ ...row("5.5"), store: null }, null), "unpopulated");
});

test("T only keeps the stored Objective and says so in the basis", () => {
  const item = buildItem(row("5.5"), "threshold", stored("5.5", { threshold: 3, objective: 5, unit: "Qty" }));
  assert.deepEqual([item.threshold, item.objective], [6, 5]);
  assert.match(item.basis, /Objective kept from the stored benchmark\.$/);
  const fresh = buildItem(row("5.5"), "objective", null);
  assert.deepEqual([fresh.threshold, fresh.objective], [null, 20]);
});

test("bulk actions never mix sources or reach a row the evaluation does not assess", () => {
  const derived = writableBySource(PREVIEW.rows, "derived");
  const judgment = writableBySource(PREVIEW.rows, "judgment");
  assert.ok(derived.length > 0 && judgment.length > 0);
  assert.ok(derived.every((entry) => entry.source === "derived"));
  assert.ok(judgment.every((entry) => entry.source === "judgment"));
  assert.ok(![...derived, ...judgment].some((entry) => isNotAssessable(entry.id)));
});

test("client conflicts list only rows that would change at the chosen scope", () => {
  const items = [buildItem(row("5.5"), "both", null), buildItem(row("5.5b"), "both", null)];
  const benchmarks = [stored("5.5", { threshold: 3, objective: 4 }), { ...stored("5.5b", { threshold: 1, objective: 2 }), interceptorId: 7 }];
  assert.deepEqual(conflictsFor(items, benchmarks, null).map((entry) => entry.kppId), ["5.5"]);
  assert.equal(findStored(benchmarks, 7, "5.5b").threshold, 1);
});

test("sections keep resolver order and Y/N levels read as words", () => {
  const sections = groupBySection(PREVIEW.rows).map((group) => group.section);
  assert.equal(new Set(sections).size, sections.length);
  assert.equal(sections[0], "4.1 MOPs");
  assert.equal(formatPresetValue(row("7.5"), "threshold"), "Required");
  assert.equal(formatPresetValue(row("8.4"), "threshold"), "6480 min");
});

test("the phase check sums the six budgets and flags a blank", () => {
  assert.equal(phaseSum(C4_ETA_60_180.threshold), 180);
  assert.equal(phaseSum({ phases: { ...C4_ETA_60_180.objective.phases, assess: "" } }), null);
});
