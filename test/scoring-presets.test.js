import assert from "node:assert/strict";
import test from "node:test";
import { buildCompliance, yesNoVerdict } from "../server/compliance.js";
import { deriveMops } from "../server/criteria.js";
import { evaluateBenchmark } from "../server/thresholds.js";

/** @returns {string} Compliance status of one Y/N row for one answer. */
function yesNoStatus(id, answer, benchmark) {
  const benchmarks = benchmark ? new Map([[id, { kppId: id, basis: "", ...benchmark }]]) : new Map();
  const table = buildCompliance(deriveMops([], {}, {}), {}, { [id]: answer }, benchmarks);
  return table.find((entry) => entry.id === id).status;
}

test("a Y/N row with no stored benchmark scores exactly as before", () => {
  assert.equal(yesNoStatus("1.7", "yes", null), "threshold");
  assert.equal(yesNoStatus("1.7", "no", null), "short");
  assert.equal(yesNoStatus("1.7", "yes", { threshold: null, objective: null }), "threshold");
});

test("a favorable answer meets the Objective once a Y/N benchmark is stored", () => {
  assert.equal(yesNoStatus("1.7", "yes", { threshold: 1, objective: 1 }), "objective");
  assert.equal(yesNoStatus("3a.3", "yes", { threshold: 0, objective: 1 }), "objective");
});

test("an unfavorable answer meets the Threshold only when the Threshold does not require it", () => {
  assert.equal(yesNoStatus("3a.3", "no", { threshold: 0, objective: 1 }), "threshold");
  assert.equal(yesNoStatus("1.7", "no", { threshold: 1, objective: 1 }), "short");
  assert.equal(yesNoStatus("1.7", "no", { threshold: null, objective: 1 }), "short");
});

test("yes-adverse rows invert the favorable answer under a stored benchmark", () => {
  assert.equal(yesNoStatus("8.3", "no", { threshold: 1, objective: 1 }), "objective");
  assert.equal(yesNoStatus("8.3", "yes", { threshold: 1, objective: 1 }), "short");
  assert.equal(yesNoStatus("8.6", "yes", { threshold: 0, objective: 1 }), "threshold");
});

test("the Y/N verdict helper matches the compliance table", () => {
  assert.equal(yesNoVerdict(true, null), "threshold");
  assert.equal(yesNoVerdict(false, null), "short");
  assert.equal(yesNoVerdict(true, { threshold: 1, objective: 1 }), "objective");
  assert.equal(yesNoVerdict(false, { threshold: 0, objective: 1 }), "threshold");
});

test("a lower minimum detection altitude scores better", () => {
  const benchmark = { threshold: 30, objective: 5, basis: "" };
  assert.equal(evaluateBenchmark("1.4", 50, benchmark).status, "short");
  assert.equal(evaluateBenchmark("1.4", 30, benchmark).status, "threshold");
  assert.equal(evaluateBenchmark("1.4", 5, benchmark).status, "objective");
});

test("a finer resolution scores better", () => {
  const benchmark = { threshold: 10, objective: 3, basis: "" };
  assert.equal(evaluateBenchmark("1.8", 12, benchmark).status, "short");
  assert.equal(evaluateBenchmark("1.8", 10, benchmark).status, "threshold");
  assert.equal(evaluateBenchmark("1.8", 2.5, benchmark).status, "objective");
});
