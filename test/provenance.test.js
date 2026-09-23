import assert from "node:assert/strict";
import test from "node:test";
import { applySheet, diffSheet, isVendorDeclared, retainSources, VENDOR_SHEET } from "../server/provenance.js";

const ORIGIN = { documentId: 7, importedAt: "2026-09-23T12:00:00.000Z" };

test("an import writes new and changed values and labels them as the vendor's", () => {
  const profile = { "INT-1": "70", "9.2": "41" };
  const { profile: next, sources, written } = applySheet(profile, {}, { "INT-1": "80.556", "5.5": "4" }, ORIGIN);
  assert.equal(written, 2);
  assert.equal(next["INT-1"], "80.556");
  assert.equal(next["5.5"], "4");
  assert.equal(next["9.2"], "41", "values the sheet leaves blank are kept");
  assert.equal(sources["INT-1"].source, VENDOR_SHEET);
  assert.equal(sources["INT-1"].documentId, 7);
  assert.equal(isVendorDeclared(sources, "9.2"), false);
});

test("a value the sheet merely repeats keeps the evaluator's provenance", () => {
  const { sources, written } = applySheet({ "INT-1": "80.556" }, {}, { "INT-1": "80.556" }, ORIGIN);
  assert.equal(written, 0);
  assert.equal(isVendorDeclared(sources, "INT-1"), false);
});

test("the preview says what an import would change, value by value", () => {
  const diff = diffSheet({ "INT-1": "70", "5.5": "4" }, { "INT-1": "80.556", "5.5": "4", "9.6": "8200" });
  const byKey = Object.fromEntries(diff.map((entry) => [entry.key, entry]));
  assert.equal(byKey["INT-1"].status, "changed");
  assert.equal(byKey["INT-1"].before, "70");
  assert.equal(byKey["5.5"].status, "unchanged");
  assert.equal(byKey["9.6"].status, "new");
  assert.equal(byKey["9.6"].before, null);
});

test("an evaluator's edit takes a value over from the vendor", () => {
  const sources = { "INT-1": { source: VENDOR_SHEET }, "5.5": { source: VENDOR_SHEET }, "9.6": { source: VENDOR_SHEET } };
  const before = { "INT-1": "80.556", "5.5": "4", "9.6": "8200" };
  const after = { "INT-1": "75", "5.5": "4" };
  const kept = retainSources(before, after, sources);
  assert.equal(isVendorDeclared(kept, "5.5"), true, "untouched value stays the vendor's");
  assert.equal(isVendorDeclared(kept, "INT-1"), false, "edited value becomes the evaluator's");
  assert.equal(isVendorDeclared(kept, "9.6"), false, "cleared value carries no provenance");
});
