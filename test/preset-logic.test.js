import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelinePreview } from "../server/benchmark-presets.js";
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
  const preset = row("1.1");
  const match = stored("1.1", { threshold: 3.41, objective: 4.35, basis: `[C4 ETA 60/180 preset: derived] ${preset.store.basis}` });
  assert.equal(rowStatus(preset, match), "matches");
  assert.equal(rowStatus(preset, stored("1.1", { threshold: 3, objective: 4 })), "differs");
  assert.equal(rowStatus(preset, null), "not_stored");
});

test("inapplicable, uncovered, and unpopulated rows are never writable", () => {
  assert.equal(rowStatus(row("5.2e"), null), "na");
  assert.equal(rowStatus(row("9.5"), null), "not_covered");
  assert.equal(rowStatus(row("5.8"), null), "unpopulated");
});

test("T only keeps the stored Objective and says so in the basis", () => {
  const item = buildItem(row("1.1"), "threshold", stored("1.1", { threshold: 3, objective: 5 }));
  assert.deepEqual([item.threshold, item.objective], [3.41, 5]);
  assert.match(item.basis, /Objective kept from the stored benchmark\.$/);
  const fresh = buildItem(row("1.1"), "objective", null);
  assert.deepEqual([fresh.threshold, fresh.objective], [null, 4.35]);
});

test("derived bulk actions never include a judgment row", () => {
  const derived = writableBySource(PREVIEW.rows, "derived");
  assert.ok(derived.length > 0);
  assert.ok(derived.every((entry) => entry.source === "derived"));
  assert.ok(!derived.some((entry) => entry.id === "5.8"), "an unpopulated cost row is not writable");
  const judgment = writableBySource(PREVIEW.rows, "judgment");
  assert.ok(!judgment.some((entry) => entry.id === "5.2e"), "a kinetic row is N/A for a non-kinetic system");
});

test("client conflicts list only rows that would change at the chosen scope", () => {
  const items = [buildItem(row("1.1"), "both", null), buildItem(row("2.1"), "both", null)];
  const benchmarks = [stored("1.1", { threshold: 3, objective: 4 }), { ...stored("2.1", { threshold: 1, objective: 2 }), interceptorId: 7 }];
  assert.deepEqual(conflictsFor(items, benchmarks, null).map((entry) => entry.kppId), ["1.1"]);
  assert.equal(findStored(benchmarks, 7, "2.1").threshold, 1);
});

test("sections keep resolver order and Y/N levels read as words", () => {
  const sections = groupBySection(PREVIEW.rows).map((group) => group.section);
  assert.equal(new Set(sections).size, sections.length);
  assert.equal(sections[0], "4.1 MOPs");
  assert.equal(formatPresetValue(row("3a.3"), "threshold"), "Not required");
  assert.equal(formatPresetValue(row("8.4"), "threshold"), "6480 min");
});

test("the phase check sums the six budgets and flags a blank", () => {
  assert.equal(phaseSum(C4_ETA_60_180.threshold), 180);
  assert.equal(phaseSum({ phases: { ...C4_ETA_60_180.objective.phases, assess: "" } }), null);
});
