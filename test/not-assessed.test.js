import assert from "node:assert/strict";
import test from "node:test";
import { formatMopValue, NOT_ASSESSED } from "../server/wor-criteria.js";

test("a MOP with no value reads as Not Assessed on the report", () => {
  assert.equal(NOT_ASSESSED, "Not Assessed");
  assert.equal(formatMopValue({ value: null, units: "%" }), "Not Assessed");
  assert.equal(formatMopValue({ value: 0.5, units: "" }), "0.50");
});
