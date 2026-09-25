import assert from "node:assert/strict";
import test from "node:test";
import { splitAreas } from "../src/criteria-view.js";

test("areas with no assessed rows collapse into one sentence", () => {
  const areas = [{ id: "1", total: 0 }, { id: "2", total: 0 }, { id: "3", total: 7 }, { id: "4", total: 2 }];
  const { shown, emptyNote } = splitAreas(areas);
  assert.deepEqual(shown.map((area) => area.id), ["3", "4"]);
  assert.equal(emptyNote, "Criteria 1 and 2 have no repeatably assessable rows.");
  assert.equal(splitAreas([{ id: "5", total: 0 }]).emptyNote, "Criterion 5 has no repeatably assessable rows.");
  assert.equal(splitAreas([{ id: "3", total: 1 }]).emptyNote, "");
});
