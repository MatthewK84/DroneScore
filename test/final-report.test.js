import assert from "node:assert/strict";
import test from "node:test";
import { flattenMops } from "../server/criteria.js";
import { buildDayRollup, buildEventCriteria, generateFinalReport } from "../server/final-report.js";
import { parseReportRange } from "../server/routes/reports.js";
import { buildSystemComparisonSection, EVENT_PERIOD } from "../server/wor-criteria.js";

const TIMEZONE = "America/New_York";

/** @returns {object} A closed day with a full closeout unless overridden. */
function day(id, date, overrides = {}) {
  return {
    id,
    day_date: date,
    location_name: "Poinsett Range",
    latitude: 33.84,
    longitude: -80.37,
    weather_note: "",
    false_alarms: 2,
    operating_minutes: 480,
    system_aborts: 1,
    repair_minutes: 30,
    operate_crew: 2,
    setup_crew: 4,
    setup_minutes: 50,
    ...overrides,
  };
}

/** @returns {object} One intercept run. */
function run(id, dayId, interceptorId, outcome, overrides = {}) {
  return {
    id,
    day_id: dayId,
    run_type: "red_air",
    outcome,
    stage_reached: "defeat",
    interceptor_id: interceptorId,
    interceptor_name: interceptorId === 1 ? "SICA" : "REDDI",
    drone_name: "Skywalker",
    uas_group: "1",
    scenario: "mlcoa",
    notes: "",
    occurred_at: "2026-09-21T14:00:00Z",
    ...overrides,
  };
}

const DAYS = [day(1, "2026-09-21"), day(2, "2026-09-22", { false_alarms: 1, operating_minutes: 420, system_aborts: 0 })];
const RUNS = [
  run(1, 1, 1, "success", { notes: "Clean kill." }),
  run(2, 1, 2, "success"),
  run(3, 2, 1, "unsuccessful", { occurred_at: "2026-09-22T14:00:00Z" }),
];

/** @returns {object} The event package for the fixture. */
function eventCriteria() {
  return buildEventCriteria({ days: DAYS, engagements: RUNS, benchmarkRows: [], matrixProfiles: [] });
}

/** @returns {object | undefined} One MOP result from a system package. */
function mop(pkg, id) {
  return flattenMops(pkg.mops).find((result) => result.id === id);
}

test("a report range accepts blanks and rejects bad or reversed dates", () => {
  assert.deepEqual(parseReportRange({}), { ok: true, from: null, to: null });
  assert.deepEqual(parseReportRange({ from: "2026-09-21", to: "" }), { ok: true, from: "2026-09-21", to: null });
  assert.equal(parseReportRange({ from: "09/21/2026" }).ok, false);
  assert.equal(parseReportRange({ to: "2026-02-31" }).ok, false);
  assert.match(parseReportRange({ from: "2026-09-22", to: "2026-09-21" }).error, /must not be after/);
});

test("runs pool across days and flow counters sum over the days a system flew", () => {
  const criteria = eventCriteria();
  const sica = criteria.systems.find((pkg) => pkg.system.name === "SICA");
  const reddi = criteria.systems.find((pkg) => pkg.system.name === "REDDI");
  assert.equal(sica.runs, 2);
  assert.equal(mop(sica, "4.2.1").value, 900, "900 operating minutes over one abort across both days");
  assert.equal(mop(reddi, "4.2.1").value, 480, "REDDI flew day 1 only: 480 minutes over one abort");
  assert.deepEqual(criteria.closeout, { completeDays: 2, partialDays: 0 });
});

test("every package in the event carries the evaluation period wording", () => {
  const criteria = eventCriteria();
  assert.equal(criteria.period, EVENT_PERIOD);
  assert.ok(criteria.systems.every((pkg) => pkg.period === EVENT_PERIOD));
  const note = buildSystemComparisonSection(criteria, null)[0].text;
  assert.match(note, /flown across the evaluation period/);
  assert.doesNotMatch(note, /this date/);
});

test("the daily WOR keeps its own wording when no period is set", () => {
  const blocks = buildSystemComparisonSection({ systems: [] }, null);
  assert.match(blocks[0].text, /on this date/);
});

test("the day rollup lists each day's Pk, closeout, and WOR control number", () => {
  const partial = [DAYS[0], day(2, "2026-09-22", { false_alarms: null })];
  const rollup = buildDayRollup(partial, RUNS, new Map([["1", "WOR-20260921-01"]]), TIMEZONE);
  assert.deepEqual(
    rollup.map((row) => [row.date, row.attempts, row.successes, row.closeout, row.controlNumber]),
    [
      ["2026-09-21", 2, 2, "Complete", "WOR-20260921-01"],
      ["2026-09-22", 1, 0, "Partial", "None"],
    ]
  );
});

test("the final report renders a PDF named for its first and last day", async () => {
  const report = await generateFinalReport({
    days: DAYS,
    engagements: RUNS,
    benchmarkRows: [],
    matrixProfiles: [],
    controlNumbers: new Map(),
    timezone: TIMEZONE,
    classification: "UNCLASSIFIED",
  });
  assert.equal(report.controlNumber, "FR-20260921-20260922");
  assert.equal(report.buffer.subarray(0, 5).toString(), "%PDF-");
});
