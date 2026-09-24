import assert from "node:assert/strict";
import test from "node:test";
import { C4_AREAS } from "../server/c4.js";
import { flattenMops } from "../server/criteria.js";
import { KPP_CATALOG } from "../server/kpp-catalog.js";
import {
  assessedCatalogView,
  describeNotAssessable,
  isNotAssessable,
  NOT_ASSESSABLE,
  NOT_ASSESSABLE_REASONS,
} from "../server/not-assessable.js";
import { assembleSystem, scoreSystem } from "../server/systems.js";
import { buildNotAssessableSection } from "../server/wor-criteria.js";

const SCORECARD_ROWS = C4_AREAS.flatMap((area) => area.sections.flatMap((section) => section.rows));
const SCORECARD_IDS = new Set(SCORECARD_ROWS.map((row) => row.id));

/** The scorecard rows the evaluation assesses, as approved. */
const KEPT_SCORECARD = ["3.1.4", "5.5", "5.5b", "5.6", "INT-8", "INT-11", "INT-12", "4.2.1", "4.2.2", "5.1.1"];

/** The supporting catalog rows the evaluation assesses, as approved. */
const KEPT_SUPPORTING = [
  "6.1", "6.3", "7.1", "7.2b", "7.2c", "7.3", "7.5", "8.1", "8.4", "8.5", "8.7", "8.8", "8.9", "8.10", "8.11",
  "9.1", "9.2", "9.4", "10.1", "10.1a", "10.1b", "10.1c", "10.1d", "10.1e", "10.1f", "10.3",
];

/** @returns {object} One system's group with a single defeat run. */
function group() {
  const row = {
    day_id: 1,
    run_type: "red_air",
    outcome: "success",
    stage_reached: null,
    time_to_intercept_s: 40,
    interceptor_id: 1,
    interceptor_name: "KI-1",
    interceptor_profile: { "1.7": "yes", "7.5": "yes" },
    uas_group: "1",
    scenario: "mlcoa",
    occurred_at: "2026-09-11T14:00:00Z",
  };
  return { interceptorId: 1, name: "KI-1", rows: [row] };
}

test("every listed id is a real row and appears once", () => {
  const known = new Set([...SCORECARD_IDS, ...KPP_CATALOG.map((entry) => entry.id), "1.1.3a", "timeline"]);
  const ids = NOT_ASSESSABLE.map((row) => row.id);
  assert.deepEqual(ids.filter((id) => !known.has(id)), []);
  assert.equal(new Set(ids).size, ids.length);
});

test("every row names a known reason and says why in one short sentence", () => {
  for (const row of NOT_ASSESSABLE) {
    assert.ok(Object.hasOwn(NOT_ASSESSABLE_REASONS, row.reason), `${row.id} has an unknown reason`);
    assert.ok(row.why.length > 0, `${row.id} gives no reason`);
    assert.ok(row.why.split(/\s+/).length < 35, `${row.id} reason runs past 35 words`);
  }
});

test("the assessed scorecard is exactly the approved ten rows", () => {
  const kept = SCORECARD_ROWS.map((row) => row.id).filter((id) => !isNotAssessable(id));
  assert.deepEqual(kept, KEPT_SCORECARD);
});

test("the assessed supporting rows are exactly the approved list", () => {
  const supporting = KPP_CATALOG.filter((entry) => !SCORECARD_IDS.has(entry.id)).map((entry) => entry.id);
  assert.deepEqual(supporting.filter((id) => !isNotAssessable(id)), KEPT_SUPPORTING);
});

test("the published package carries no row the evaluation does not assess", () => {
  const pkg = assembleSystem(group(), {}, []);
  const scored = pkg.scorecard.areas.flatMap((area) => area.sections.flatMap((section) => section.rows));
  const supporting = pkg.scorecard.supporting.flatMap((entry) => entry.rows);
  const published = [...scored, ...supporting, ...pkg.compliance, ...flattenMops(pkg.mops)];
  assert.deepEqual(published.filter((row) => isNotAssessable(row.id)).map((row) => row.id), []);
  assert.equal(pkg.scorecard.total, KEPT_SCORECARD.length);
  assert.equal(pkg.scorecard.notAssessable, SCORECARD_ROWS.length - KEPT_SCORECARD.length);
  assert.equal(pkg.timeline, null, "the engagement timeline is on the list");
});

test("areas left with no assessed rows say so and stay out of the average", () => {
  const pkg = assembleSystem(group(), {}, [
    { interceptor_id: null, kpp_id: "3.1.4", uas_group: "", threshold: 60, objective: 25, unit: "sec", basis: "", critical: false },
  ]);
  const [area1, area2, area3] = pkg.scorecard.areas;
  assert.deepEqual([area1.total, area2.total], [0, 0]);
  assert.equal(area1.notAssessable, 20);
  assert.equal(area3.score, 1, "40 s beats the 60 s threshold but not the 25 s objective");
  assert.equal(pkg.scorecard.overall, 1, "only area 3 carries a score");
});

test("the engine still scores every row, so a row can move back without code changes", () => {
  const full = scoreSystem(group(), {}, []);
  assert.equal(full.scorecard.total, SCORECARD_ROWS.length);
  assert.ok(full.compliance.some((row) => row.id === "1.7"));
});

test("the capture catalog hides moved rows and empty groups", () => {
  const view = assessedCatalogView();
  assert.ok(view.catalog.every((entry) => !isNotAssessable(entry.id)));
  assert.ok(view.categories.every((category) => category.entries.length > 0));
  const areaRows = view.areas.flatMap((area) => area.sections.flatMap((section) => section.rows));
  assert.deepEqual(areaRows.map((row) => row.id), KEPT_SCORECARD);
});

test("the report section lists every row with its reason", () => {
  const text = JSON.stringify(buildNotAssessableSection());
  for (const group of describeNotAssessable()) {
    for (const row of group.rows) {
      assert.ok(text.includes(row.label), `${row.label} missing from the report section`);
    }
  }
  assert.match(text, new RegExp(`these ${NOT_ASSESSABLE.length} criteria`));
});
