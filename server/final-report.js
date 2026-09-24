import { computeDayStats } from "./analytics.js";
import { primarySystem } from "./compliance.js";
import { CRITERIA } from "./criteria.js";
import { assembleSystem, combineDayCounters, countUnassigned, partitionBySystem } from "./systems.js";
import { buildMatrixCoverage } from "./testmatrix.js";
import { compactDate, formatDateLong, formatTimeLocal } from "./time.js";
import {
  buildBasisSection,
  buildMatrixSection,
  buildNotAssessableSection,
  buildSystemComparisonSection,
  buildSystemSections,
  EVENT_PERIOD,
  NOT_ASSESSED,
} from "./wor-criteria.js";
import {
  buildConditions,
  buildNarrative,
  buildPerformance,
  documentShell,
  fmtPk,
  heading,
  kvTable,
  renderPdf,
} from "./wor.js";

/**
 * Final evaluation report. It consolidates every closed day in a date
 * range into one document, apart from the daily WORs. Runs pool across
 * the days, so each system is scored once on everything it flew, the same
 * way the criteria progress board scores it. Each daily WOR stays the
 * record of its own day, and this report lists their control numbers.
 *
 * Nothing here is stored. The report is generated on request from the
 * current data and the benchmarks stored at that moment.
 */

const INK = "#1A2018";
const MUTED = "#5A6355";
const HEADER_FILL = "#E9ECE2";
const LINE = "#C9CDBF";

/** The package for a period with no runs against any interceptor. */
const NO_SYSTEM = Object.freeze({ interceptorId: null, name: null, rows: [] });

/** @returns {boolean} True for a Red Air intercept run. */
function isRedAir(row) {
  return row.run_type !== "abort";
}

/**
 * Scores one system on every run it flew in the period, with the closeout
 * counters of the days it flew.
 *
 * @returns {object} The system's criteria package, worded for the period.
 */
function eventSystemPackage(group, days, benchmarkRows) {
  const flownIds = new Set(group.rows.map((row) => String(row.day_id)));
  const flown = days.filter((day) => flownIds.has(String(day.id)));
  const { counters } = combineDayCounters(flown);
  return { ...assembleSystem(group, counters, benchmarkRows), period: EVENT_PERIOD };
}

/**
 * Builds the criteria package for the whole period, in the shape the WOR
 * section builders read.
 *
 * @param {{ days: object[], engagements: object[], benchmarkRows: object[], matrixProfiles: object[] }} input
 * @returns {object} Criteria package with `period` set to EVENT_PERIOD.
 */
export function buildEventCriteria({ days, engagements, benchmarkRows, matrixProfiles }) {
  const systems = partitionBySystem(engagements).map((group) => eventSystemPackage(group, days, benchmarkRows));
  const closeout = combineDayCounters(days);
  const lead = systems[0] || { ...assembleSystem(NO_SYSTEM, closeout.counters, benchmarkRows), period: EVENT_PERIOD };
  return {
    criteria: CRITERIA,
    mops: lead.mops,
    compliance: lead.compliance,
    summary: lead.summary,
    scorecard: lead.scorecard,
    timeline: lead.timeline,
    system: primarySystem(engagements.filter(isRedAir)),
    uasGroup: lead.uasGroup,
    systems,
    unassignedRuns: countUnassigned(engagements),
    matrix: buildMatrixCoverage(matrixProfiles, engagements),
    period: EVENT_PERIOD,
    closeout: { completeDays: closeout.completeDays, partialDays: closeout.partialDays },
  };
}

/**
 * One line per day for the day-by-day table.
 *
 * @param {object[]} days Closed days in the period, oldest first.
 * @param {object[]} engagements Every run in the period.
 * @param {Map<string, string>} controlNumbers Latest WOR control number by day id.
 * @param {string} timezone
 * @returns {object[]}
 */
export function buildDayRollup(days, engagements, controlNumbers, timezone) {
  return days.map((day) => {
    const rows = engagements.filter((row) => String(row.day_id) === String(day.id));
    const { overall } = computeDayStats(rows, timezone);
    return {
      date: day.day_date,
      runs: rows.length,
      attempts: overall.attempts,
      successes: overall.successes,
      pk: overall.pk,
      closeout: combineDayCounters([day]).completeDays === 1 ? "Complete" : "Partial",
      controlNumber: controlNumbers.get(String(day.id)) || "None",
    };
  });
}

/** @returns {string} A score out of two, or Not Assessed. */
function scoreText(value) {
  return value === null || value === undefined ? NOT_ASSESSED : `${value.toFixed(2)} of 2`;
}

/** @returns {string} The first and last date the report covers. */
function periodText(days) {
  const first = formatDateLong(days[0].day_date);
  const last = formatDateLong(days[days.length - 1].day_date);
  return days.length === 1 ? first : `${first} to ${last}`;
}

/** @returns {string[]} Distinct values of one field, in first-seen order. */
function distinct(values) {
  return [...new Set(values.filter((value) => value))];
}

/** @returns {string} Section 1: the bottom line across the period. */
function eventBluf(input) {
  const { days, stats, criteria } = input;
  const parts = [
    `This report consolidates ${days.length} closed ${days.length === 1 ? "day" : "days"} of testing, ${periodText(days)}.`,
    `Scorers logged ${stats.totalRuns} runs.`,
  ];
  if (stats.overall.total > 0) {
    parts.push(
      `Across ${stats.overall.total} Red Air intercept runs, interceptors achieved ${stats.overall.successes} ` +
        `successful intercepts in ${stats.overall.attempts} attempts for a Pk of ${fmtPk(stats.overall.pk)}.`
    );
  }
  const lead = criteria.systems[0];
  if (lead) {
    parts.push(
      `${lead.system.name} scored ${scoreText(lead.scorecard.overall)} on the C4 scorecard, from ` +
        `${lead.scorecard.states.scored} of ${lead.scorecard.total} rows with a score.`
    );
  }
  const flagged = criteria.systems.filter((pkg) => pkg.scorecard.notMilitarilyEffective);
  if (flagged.length > 0) {
    parts.push(`Not Militarily Effective: ${flagged.map((pkg) => pkg.system.name).join(", ")}.`);
  }
  return parts.join(" ");
}

/** @returns {object} Section 2: what the period covers and where it came from. */
function eventOverview(input) {
  const { days, rollup, criteria } = input;
  const reports = rollup.filter((row) => row.controlNumber !== "None").map((row) => row.controlNumber);
  return kvTable([
    ["Period", periodText(days)],
    ["Days Included", `${days.length} closed: ${days.map((day) => day.day_date).join(", ")}`],
    ["Location", distinct(days.map((day) => day.location_name)).join("; ") || "N/A"],
    ["Systems Evaluated", criteria.systems.map((pkg) => pkg.system.name).join(", ") || "None"],
    ["Daily Reports", reports.join(", ") || "None"],
    ["Day Closeout", `${criteria.closeout.completeDays} of ${days.length} days recorded every counter`],
    ["Benchmarks", "Scored against the Threshold and Objective values stored when this report was generated."],
  ]);
}

/** @returns {object} A day-shaped record carrying every scorer weather note. */
function weatherNotes(days) {
  const notes = days.filter((day) => day.weather_note).map((day) => `${day.day_date}: ${day.weather_note}`);
  return { weather_note: notes.join(" ") };
}

/** @returns {object} Section 4: one row per day with its own WOR. */
function rollupTable(rollup) {
  const header = ["Date", "Runs", "Attempts", "Successes", "Pk", "Closeout", "Daily WOR"].map((text) => ({
    text,
    bold: true,
    fillColor: HEADER_FILL,
  }));
  const body = rollup.map((row) => [
    row.date,
    row.runs,
    row.attempts,
    row.successes,
    fmtPk(row.pk),
    row.closeout,
    row.controlNumber,
  ]);
  return {
    table: { headerRows: 1, widths: [58, 32, 44, 50, 34, 50, "*"], body: [header, ...body] },
    layout: { hLineColor: () => LINE, vLineColor: () => LINE },
    fontSize: 8,
    margin: [0, 0, 0, 10],
  };
}

/** @returns {object[]} Section 6: every scorer note in the period, dated. */
function eventObservations(input) {
  const { days, engagements, timezone } = input;
  const dates = new Map(days.map((day) => [String(day.id), day.day_date]));
  const noted = engagements.filter((row) => row.notes && row.notes.trim().length > 0);
  if (noted.length === 0) {
    return [{ text: "Scorers recorded no free text observations in this period.", italics: true }];
  }
  return noted.map((row) => ({
    margin: [0, 0, 0, 6],
    text: [
      {
        text:
          `${dates.get(String(row.day_id)) || ""} ${formatTimeLocal(new Date(row.occurred_at), timezone)}L  ` +
          `[${isRedAir(row) ? "RED AIR" : "ABORT"}]  ${row.interceptor_name || "N/A"} vs ${row.drone_name || "N/A"}: `,
        bold: true,
      },
      row.notes.trim(),
    ],
  }));
}

/** @returns {object[]} The title block. */
function titleBlock(controlNumber, generatedAt, days) {
  return [
    { text: "FINAL EVALUATION REPORT", style: "title", alignment: "center" },
    {
      text: `DRONESMOKE C-sUAS Interceptor Evaluation  |  ${controlNumber}`,
      alignment: "center",
      fontSize: 9.5,
      margin: [0, 4, 0, 2],
    },
    { text: `Covers ${periodText(days)}`, alignment: "center", fontSize: 8.5, color: INK },
    { text: `Generated ${generatedAt}`, alignment: "center", fontSize: 8, color: MUTED },
  ];
}

/** @returns {object[]} Every section of the final report, in order. */
function reportContent(input) {
  const { criteria, stats } = input;
  return [
    ...titleBlock(input.controlNumber, input.generatedAt, input.days),
    heading(1, "Bottom Line Up Front"),
    { text: eventBluf(input) },
    heading(2, "Evaluation Overview"),
    eventOverview(input),
    heading(3, "Environmental Conditions"),
    ...buildConditions(weatherNotes(input.days), stats, "this period"),
    heading(4, "Day-by-Day Summary"),
    rollupTable(input.rollup),
    { text: "Each daily WOR holds that day's full run log.", fontSize: 7.5, italics: true, color: MUTED },
    heading(5, "Performance Analysis"),
    ...buildPerformance(stats),
    heading(6, "Scorer Observations"),
    ...eventObservations(input),
    heading(7, "Assessment"),
    { text: buildNarrative(stats) },
    { text: "", pageBreak: "before" },
    heading(8, "Capability Characterization: System Comparison"),
    ...buildSystemComparisonSection(criteria, stats),
    heading(9, "Capability Characterization by System"),
    ...buildSystemSections(criteria, stats),
    { text: "", pageBreak: "before" },
    heading(10, "Test Matrix Coverage"),
    ...buildMatrixSection(criteria),
    heading(11, "Benchmark Basis"),
    ...buildBasisSection(criteria),
    { text: "", pageBreak: "before" },
    heading(12, "Not Repeatably Assessable"),
    ...buildNotAssessableSection(),
  ];
}

/**
 * Builds the final report PDF.
 *
 * @param {{ days: object[], engagements: object[], benchmarkRows: object[], matrixProfiles: object[],
 *   controlNumbers: Map<string, string>, timezone: string, classification: string }} input
 *   Days are the closed days in the period, oldest first, day_date as YYYY-MM-DD.
 * @returns {Promise<{ controlNumber: string, buffer: Buffer }>}
 */
export async function generateFinalReport(input) {
  const { days, engagements, timezone } = input;
  const controlNumber = `FR-${compactDate(days[0].day_date)}-${compactDate(days[days.length - 1].day_date)}`;
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
  const content = reportContent({
    ...input,
    controlNumber,
    generatedAt,
    criteria: buildEventCriteria(input),
    stats: computeDayStats(engagements, timezone),
    rollup: buildDayRollup(days, engagements, input.controlNumbers, timezone),
  });
  const buffer = await renderPdf(documentShell({ controlNumber, classification: input.classification, content }));
  return { controlNumber, buffer };
}
