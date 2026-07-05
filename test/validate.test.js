import test from "node:test";
import assert from "node:assert/strict";
import {
  asId,
  asIsoDate,
  asOptionalNumber,
  asOutcome,
  asText,
  requiredText,
} from "../server/validate.js";

test("asOutcome accepts only known outcomes", () => {
  assert.equal(asOutcome("success"), "success");
  assert.equal(asOutcome("unsuccessful"), "unsuccessful");
  assert.equal(asOutcome("not_attempted"), "not_attempted");
  assert.equal(asOutcome("bogus"), null);
  assert.equal(asOutcome(5), null);
});

test("asId accepts positive integers only", () => {
  assert.equal(asId("5"), 5);
  assert.equal(asId("0"), null);
  assert.equal(asId("-3"), null);
  assert.equal(asId("abc"), null);
});

test("asOptionalNumber enforces bounds and blank handling", () => {
  assert.equal(asOptionalNumber("", 0, 10), null);
  assert.equal(asOptionalNumber("5", 0, 10), 5);
  assert.equal(asOptionalNumber("11", 0, 10), null);
  assert.equal(asOptionalNumber("-1", 0, 10), null);
});

test("asIsoDate validates the date shape", () => {
  assert.equal(asIsoDate("2026-07-04"), "2026-07-04");
  assert.equal(asIsoDate("07/04/2026"), null);
  assert.equal(asIsoDate("2026-7-4"), null);
});

test("text helpers trim and reject empties", () => {
  assert.equal(requiredText("  hi  "), "hi");
  assert.equal(requiredText("   "), null);
  assert.equal(asText(123), "");
  assert.equal(asText("  keep  "), "keep");
});
