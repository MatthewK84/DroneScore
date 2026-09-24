import { CRITERIA } from "./criteria.js";
import { describeNotAssessable, isNotAssessable } from "./not-assessable.js";
import { formatQuantity } from "./units.js";

/**
 * Warfighter Observation Report sections for the C-sUAS Capability
 * Characterization Criteria. Kept separate from wor.js so the original
 * report builder stays readable and each section here stays small.
 *
 * The rule these sections follow is that a number never appears without
 * its basis. A Pk derived from six runs and a Pk inferred from an outcome
 * column look identical on the page unless the page says which is which,
 * and in a formal evaluation that difference is the whole point.
 */

const HEADER_FILL = "#E9ECE2";
const LINE = "#C9CDBF";
const INK = "#1A2018";

/** What every row, area, or overall score without a score reads as. */
export const NOT_ASSESSED = "Not Assessed";

/**
 * Phrases that name the period a report covers. A criteria package with no
 * `period` is a daily WOR, and reads exactly as it always has.
 */
export const DAY_PERIOD = Object.freeze({
  when: "on this date",
  runs: "the day's intercept runs",
  shared:
    "Every system shares the day's range space, so the day closeout counters (false alarms, " +
    "operating time, system aborts, repair time, crew, and setup time) apply to each of them.",
  runLog: "the run log",
});

/** Phrases for the final report, which spans every day in its period. */
export const EVENT_PERIOD = Object.freeze({
  when: "across the evaluation period",
  runs: "every intercept run in the evaluation period",
  shared:
    "Each system is scored with the closeout counters of the days it flew. False alarms, " +
    "operating time, system aborts, and repair time sum over days with a complete closeout. " +
    "Crew and setup time come from the latest day that recorded them.",
  runLog: "the daily run logs",
});

/** @returns {object} The period phrases for a criteria package. */
function periodOf(criteria) {
  return criteria?.period || DAY_PERIOD;
}

const STATUS_LABELS = Object.freeze({
  objective: "Objective",
  threshold: "Threshold",
  short: "Fell short",
  not_established: NOT_ASSESSED,
  not_measured: NOT_ASSESSED,
  stated: "Stated",
  claimed: "Claimed",
});

const STATUS_COLORS = Object.freeze({
  objective: "#2E7D32",
  threshold: "#3E4A2E",
  short: "#B3261E",
  not_established: "#B98A00",
  not_measured: "#5A6355",
  stated: "#5A6355",
  claimed: "#B85410",
});

/**
 * Marks a figure by where it came from, so a vendor's declaration and a
 * computed value never pass on the page as a measurement.
 */
const SOURCE_MARKS = Object.freeze({ "Vendor-declared": " \u2020", Derived: " \u2021" });

/** @returns {string} The mark for a figure's source, or "". */
function sourceMark(source) {
  return SOURCE_MARKS[source] || "";
}

/** @returns {object} The legend for the source marks. */
function sourceLegend() {
  return {
    text:
      "\u2020 Declared by the vendor on the data sheet, not demonstrated in test. " +
      "\u2021 Derived by arithmetic on declared and demonstrated figures; the working is under Vendor Declarations and Derivations.",
    fontSize: 7,
    italics: true,
    color: "#5A6355",
    margin: [0, 0, 0, 6],
  };
}

/** @returns {object} Standard table layout for these sections. */
function tableLayout() {
  return { hLineColor: () => LINE, vLineColor: () => LINE };
}

/** @returns {object[]} A bolded, filled header row. */
function headerRow(labels) {
  return labels.map((text) => ({ text, bold: true, fillColor: HEADER_FILL }));
}

/** @returns {string} A MOP value rendered for the page. */
export function formatMopValue(result) {
  const { value, units } = result;
  if (value === null || value === undefined) {
    return NOT_ASSESSED;
  }
  if (typeof value === "object") {
    return `mean ${value.mean}${units} (min ${value.min}, max ${value.max}, n=${value.n})`;
  }
  if (typeof value === "number") {
    return units === "" ? value.toFixed(2) : `${value} ${units}`;
  }
  return String(value);
}

/** @returns {object} The MOP results table for one criterion. */
function criterionTable(group) {
  const body = group.results.map((result) => [
    { text: `MOP ${result.id}`, bold: true },
    result.name,
    formatMopValue(result),
    String(result.n),
    { text: result.basis, italics: true },
  ]);
  return {
    table: {
      headerRows: 1,
      widths: [46, "*", 128, 24, 96],
      body: [headerRow(["MOP", "Measure", "Result", "n", "Basis"]), ...body],
    },
    layout: tableLayout(),
    fontSize: 7.5,
    margin: [0, 0, 0, 10],
  };
}

/**
 * Section 5 reports Pk from the outcome column, counting every attempted
 * run as an engagement. Section 8 reports Pk from captured kill chain
 * stages, counting only runs that actually reached the engage stage. A run
 * that lost track before launch is an attempt under the first definition
 * and not an engagement under the second, so the two figures can differ.
 *
 * Two unexplained Pk values on one report reads as an arithmetic error, so
 * where they diverge the report says so and says which is which.
 *
 * @param {object} criteria
 * @param {object} stats
 * @returns {object[]} A reconciliation note, or nothing when they agree.
 */
function reconcilePk(criteria, stats) {
  const derived = criteria.mops
    .flatMap((group) => group.results)
    .find((result) => result.id === "3.1.2");
  const outcomePk = stats?.overall?.pk;
  if (derived?.value === null || derived?.value === undefined || outcomePk === null || outcomePk === undefined) {
    return [];
  }
  if (Math.abs(derived.value - outcomePk) < 0.005) {
    return [];
  }
  return [
    {
      text:
        `Section 5 reports this system's Pk as ${outcomePk.toFixed(2)} and MOP 3.1.2 reports ` +
        `Pk ${derived.value.toFixed(2)}. Both are correct under their own definition. ` +
        "Section 5 divides successes by every attempted run. MOP 3.1.2 divides defeats " +
        `by the ${derived.n} runs that reached the engage stage, excluding runs that ` +
        "broke down earlier in the kill chain. Where stage data was captured, MOP 3.1.2 " +
        "is the figure that answers Criterion 3.",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
  ];
}

/** @returns {object} The note explaining the Basis column of every MOP table. */
function mopIntro() {
  return {
    text:
      "Measures of Performance derived under section 4.1. The Basis column states " +
      "whether each figure was captured at the kill chain stage picker, inferred " +
      "from the run outcome, or taken from day closeout entries. An inferred " +
      "proportion is not a measurement of that stage and should not be read as one.",
    fontSize: 8,
    italics: true,
    margin: [0, 0, 0, 8],
  };
}

/** @returns {object[]} Derived MOP results per criterion for one system. */
function buildMopResults(criteria, stats) {
  const blocks = [...reconcilePk(criteria, stats)];
  for (const group of criteria.mops) {
    const meta = CRITERIA.find((entry) => entry.id === group.criterion);
    blocks.push({
      text: `Criterion ${group.criterion} - ${meta ? meta.name : ""}`,
      bold: true,
      fontSize: 9,
      color: INK,
      margin: [0, 6, 0, 5],
    });
    blocks.push(criterionTable(group));
  }
  return blocks;
}

/** @returns {string} A benchmark limit rendered for the page. */
function limitText(value) {
  return value === null || value === undefined ? "--" : String(value);
}

/** @returns {string} The measured column for one compliance row. */
function measuredText(row) {
  const mark = sourceMark(row.source);
  if (row.detail) {
    return `${row.detail.length > 60 ? `${row.detail.slice(0, 57)}...` : row.detail}${mark}`;
  }
  if (row.measured === null || row.measured === undefined) {
    return "--";
  }
  const value = formatQuantity(row.measured, row.units);
  return `${row.status === "claimed" ? `Claimed ${value}` : value}${mark}`;
}

/** @returns {object[]} Compliance rows worth printing for a category. */
function complianceBody(rows) {
  return rows.map((row) => [
    { text: row.label, bold: true },
    row.measure,
    measuredText(row),
    limitText(row.threshold),
    limitText(row.objective),
    { text: STATUS_LABELS[row.status] || row.status, color: STATUS_COLORS[row.status] || INK, bold: true },
  ]);
}

/** @returns {object[]} Section 9: KPP Threshold and Objective compliance. */
function buildComplianceSection(criteria) {
  if (!criteria) {
    return [{ text: "KPP compliance data was unavailable.", italics: true }];
  }
  const { summary, system } = criteria;
  const blocks = [
    {
      text:
        `Compliance is reported for ${system.name || "the system under test"}, from its own runs only.` +
        ` Achieved Objective on ${summary.objective}, met Threshold on ${summary.threshold}, ` +
        `fell short on ${summary.short}. ${summary.not_established} KPPs are Not Assessed because no ` +
        `benchmark is stored, and ${summary.not_measured} are Not Assessed because nothing measured them ${periodOf(criteria).when}. ` +
        (summary.claimed > 0
          ? `${summary.claimed} are performance claims from the vendor's data sheet, shown but not scored until demonstrated. `
          : "") +
        "Section 4.2 requires benchmarks to be documented before test execution, so a " +
        "KPP Not Assessed for want of a benchmark is an open action against the evaluation, not a pass.",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
  ];
  const categories = [...new Set(criteria.compliance.map((row) => row.category))];
  for (const category of categories) {
    const rows = criteria.compliance.filter((row) => row.category === category);
    blocks.push({ text: category, bold: true, fontSize: 9, margin: [0, 6, 0, 5] });
    blocks.push({
      table: {
        headerRows: 1,
        widths: [50, "*", 78, 44, 44, 58],
        body: [headerRow(["KPP", "Measure", "Measured", "Thresh.", "Obj.", "Verdict"]), ...complianceBody(rows)],
      },
      layout: tableLayout(),
      fontSize: 7.5,
      margin: [0, 0, 0, 8],
    });
  }
  return blocks;
}

/** @returns {string} The target line summary for a matrix profile. */
function targetSummary(profile) {
  if (profile.targets.length === 0) {
    return "No targets defined";
  }
  return profile.targets
    .map((target) => {
      const parts = [target.targetName];
      if (target.elevationFtAgl !== null) {
        parts.push(`${target.elevationFtAgl} ft`);
      }
      if (target.speedMph !== null) {
        parts.push(`${target.speedMph} mph`);
      }
      if (target.launchPoint) {
        parts.push(`LP ${target.launchPoint}`);
      }
      return parts.join(" / ");
    })
    .join("; ");
}

/** @returns {string} Ink color for a matrix coverage status. */
function coverageColor(status) {
  if (status === "complete") {
    return "#2E7D32";
  }
  if (status === "short") {
    return "#B98A00";
  }
  return "#5A6355";
}

/** @returns {object[]} Section 10: test matrix coverage. */
export function buildMatrixSection(criteria) {
  const matrix = criteria?.matrix;
  if (!matrix || matrix.rows.length === 0) {
    return [
      {
        text: "No test matrix profiles are defined, so coverage cannot be reported.",
        italics: true,
      },
    ];
  }
  const body = matrix.rows.map((row) => [
    { text: row.code, bold: true },
    row.mission,
    targetSummary(row),
    row.timeOfDay,
    `${row.achieved} / ${row.required}`,
    { text: row.status, bold: true, color: coverageColor(row.status) },
  ]);
  return [
    {
      text:
        `${matrix.complete} of ${matrix.total} matrix profiles reached their required data ` +
        `points ${periodOf(criteria).when}. ${matrix.unassigned} logged runs were not assigned to a profile ` +
        "and are excluded from coverage; unassigned runs are not distributed across profiles, " +
        "because doing so would credit coverage that was never demonstrated.",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        headerRows: 1,
        widths: [34, 58, "*", 34, 44, 50],
        body: [headerRow(["Profile", "Mission", "Targets", "Time", "Points", "Status"]), ...body],
      },
      layout: tableLayout(),
      fontSize: 7.5,
      margin: [0, 0, 0, 8],
    },
  ];
}

/**
 * Every benchmark actually used, across every system on the day: catalog
 * KPPs through their compliance records, and scorecard MOP rows, which
 * carry benchmarks of their own and have no compliance record.
 *
 * @returns {{ label: string, basis: string }[]}
 */
function benchmarksUsed(criteria) {
  const packages = criteria?.systems?.length > 0 ? criteria.systems : [criteria || {}];
  const used = [];
  for (const pkg of packages) {
    for (const row of pkg.compliance || []) {
      used.push({ label: row.label, basis: row.basis });
    }
    for (const area of pkg.scorecard?.areas || []) {
      for (const section of area.sections) {
        for (const row of section.rows.filter((entry) => entry.kind === "MOP")) {
          used.push({ label: row.label, basis: row.benchmarkBasis });
        }
      }
    }
  }
  return used.filter((entry) => entry.basis && entry.basis.length > 0);
}

/** @returns {object[]} Section 11: the basis behind every benchmark used. */
export function buildBasisSection(criteria) {
  const withBasis = benchmarksUsed(criteria);
  if (withBasis.length === 0) {
    return [
      {
        text:
          "No Threshold or Objective benchmarks were established for this evaluation. " +
          "Section 4.2 requires them to be defined and documented before test execution.",
        italics: true,
      },
    ];
  }
  const seen = new Set();
  const blocks = [];
  for (const row of withBasis) {
    if (seen.has(row.basis)) {
      continue;
    }
    seen.add(row.basis);
    const sharing = [...new Set(withBasis.filter((other) => other.basis === row.basis).map((other) => other.label))];
    blocks.push({
      margin: [0, 0, 0, 5],
      fontSize: 8,
      text: [{ text: `${sharing.join(", ")}: `, bold: true }, row.basis],
    });
  }
  return blocks;
}

/** Ink color for a 0/1/2 score, matched to the compliance verdict colors. */
const SCORE_COLORS = Object.freeze({ 0: "#B3261E", 1: "#3E4A2E", 2: "#2E7D32" });

/** Labels for the scorecard states that carry no score. */
const STATE_LABELS = Object.freeze({
  not_applicable: "N/A",
  reported: "Reported",
  no_benchmark: NOT_ASSESSED,
  not_measured: NOT_ASSESSED,
  claimed: "Claimed",
});

/** @returns {object} The Score cell for one scorecard row. */
function scoreCell(row) {
  if (row.state !== "scored") {
    return { text: STATE_LABELS[row.state] || NOT_ASSESSED, color: "#5A6355" };
  }
  return { text: String(row.score), bold: true, color: SCORE_COLORS[row.score] || INK };
}

/** @returns {string} A benchmark limit rendered for the page. */
function scoreLimit(value) {
  return value === null || value === undefined ? "--" : String(value);
}

/** @returns {object} One Core Capability Area table. */
function areaTable(section) {
  const body = section.rows.map((row) => [
    { text: row.label, bold: true },
    row.measure,
    row.units,
    row.measuredText ? `${row.measuredText}${sourceMark(row.source)}` : "--",
    scoreLimit(row.threshold),
    scoreLimit(row.objective),
    scoreCell(row),
  ]);
  return {
    table: {
      headerRows: 1,
      widths: [46, "*", 40, 70, 34, 34, 46],
      body: [headerRow(["ID", "MOP / KPP", "Unit", "Measured", "Thresh.", "Obj.", "Score"]), ...body],
    },
    layout: tableLayout(),
    fontSize: 7,
    margin: [0, 0, 0, 8],
  };
}

/** @returns {object[]} The paragraph stating the Overall System Score. */
function scorecardSummary(scorecard, period) {
  const overall = scorecard.overall === null ? NOT_ASSESSED : `${scorecard.overall.toFixed(2)} of 2`;
  return [
    {
      text:
        `Overall System Score ${overall}, the equal-weight average of the Core Capability ` +
        `Areas that carry a score. ${scorecard.notAssessable ?? 0} rows are Not Repeatably ` +
        `Assessable and are left out; section 12 lists them with the reason for each. ` +
        `${scorecard.states.scored} of the ${scorecard.total} assessed rows carry ` +
        `a score. Of the rest: ${scorecard.states.no_benchmark} Not Assessed with no Threshold or ` +
        `Objective stored, ${scorecard.states.not_measured} Not Assessed with no measurement ${period.when}, ` +
        `${scorecard.states.reported} reported as specifications the criteria do not score, ` +
        `${scorecard.states.claimed} vendor performance claims not yet demonstrated, ` +
        `${scorecard.states.not_applicable} marked not applicable to this configuration. ` +
        "Only scored rows enter the average: averaging over rows that were never " +
        "benchmarked would let an evaluation raise its score by measuring less.",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
  ];
}

/** @returns {object[]} The militarily effective verdict, stated either way. */
function effectivenessVerdict(scorecard, period) {
  if (!scorecard.notMilitarilyEffective) {
    return [
      {
        text:
          "No Critical KPP scored 0, so the criteria do not flag this system Not " +
          `Militarily Effective ${period.when}. Criticality is declared by the evaluator ` +
          "on the benchmark record; a KPP never marked Critical cannot raise this flag.",
        fontSize: 8,
        margin: [0, 0, 0, 8],
      },
    ];
  }
  const named = scorecard.criticalFailures
    .map((entry) => `${entry.label} ${entry.measure}`)
    .join("; ");
  return [
    {
      text: `NOT MILITARILY EFFECTIVE. Critical KPP scored 0: ${named}.`,
      bold: true,
      color: "#B3261E",
      fontSize: 9,
      margin: [0, 0, 0, 8],
    },
  ];
}

/** @returns {string} An area's score and row counts for its heading. */
function areaHeadline(area) {
  if (area.total === 0) {
    return "every row is Not Repeatably Assessable (section 12)";
  }
  const score = area.score === null ? NOT_ASSESSED : `${area.score.toFixed(2)} of 2`;
  const moved = area.notAssessable > 0 ? `; ${area.notAssessable} Not Repeatably Assessable` : "";
  return `${score} from ${area.states.scored} of ${area.total} rows${moved}`;
}

/** @returns {object[]} The consolidated C4 scorecard for one system. */
function buildScorecardSection(criteria) {
  const scorecard = criteria?.scorecard;
  if (!scorecard) {
    return [{ text: "Scorecard data was unavailable.", italics: true }];
  }
  const period = periodOf(criteria);
  const blocks = [...scorecardSummary(scorecard, period), ...effectivenessVerdict(scorecard, period)];
  for (const area of scorecard.areas) {
    blocks.push({
      text: `Criterion ${area.id} - ${area.name}: ${areaHeadline(area)}`,
      bold: true,
      fontSize: 9,
      color: INK,
      margin: [0, 6, 0, 5],
    });
    for (const section of area.sections) {
      blocks.push({ text: section.title, fontSize: 8, italics: true, margin: [0, 0, 0, 3] });
      blocks.push(areaTable(section));
    }
  }
  return blocks;
}

/** @returns {string} A timeline cell rendered for the page. */
function phaseCell(value) {
  return value === null || value === undefined ? "--" : String(value);
}

/** @returns {object[]} Section 13: the engagement timeline. */
function buildTimelineSection(criteria) {
  const timeline = criteria?.timeline;
  if (!timeline) {
    return [{ text: "Engagement timeline data was unavailable.", italics: true }];
  }
  const { total } = timeline;
  const body = [...timeline.phases, total].map((row) => [
    { text: row.phase, bold: row.n === undefined },
    phaseCell(row.mlcoa),
    phaseCell(row.mdcoa),
    phaseCell(row.delta),
  ]);
  return [
    {
      text:
        `Mean seconds per phase across ${periodOf(criteria).runs}, split by the scenario ` +
        `each run was flown under. The total covers ${total.coveredPhases.mlcoa} of ` +
        `${total.phaseCount} phases under MLCOA and ${total.coveredPhases.mdcoa} of ` +
        `${total.phaseCount} under MDCOA. A phase with no captured timing is left blank ` +
        "rather than counted as zero, so a total built from part of the chain is not a " +
        "total engagement time and is not presented as one.",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        headerRows: 1,
        widths: ["*", 70, 70, 50],
        body: [headerRow(["Phase", "MLCOA (sec)", "MDCOA (sec)", "Delta"]), ...body],
      },
      layout: tableLayout(),
      fontSize: 7.5,
      margin: [0, 0, 0, 8],
    },
  ];
}

/** @returns {object} A score cell out of two, or a small Not Assessed cell. */
function outOfTwo(value, bold = false) {
  if (value === null || value === undefined) {
    return { text: NOT_ASSESSED, fontSize: 6, color: "#5A6355" };
  }
  return { text: value.toFixed(2), bold };
}

/** @returns {object | null} Section 5's Pk rollup for one system, shaped for reconcilePk. */
function systemStats(stats, name) {
  const entry = (stats?.byInterceptor || []).find((row) => row.label === name);
  return entry ? { overall: entry } : null;
}

/** @returns {object[]} The note shown when no run named an interceptor. */
function noSystems(period) {
  return [
    {
      text: `No runs were logged against an interceptor ${period.when}, so no system can be characterized.`,
      italics: true,
    },
  ];
}

/** @returns {object} One comparison table row. */
function comparisonRow(pkg, stats) {
  const { scorecard } = pkg;
  const pk = systemStats(stats, pkg.system.name)?.overall?.pk;
  const flagged = scorecard.notMilitarilyEffective;
  return [
    { text: pkg.system.name, bold: true },
    String(pkg.runs),
    pk === null || pk === undefined ? "--" : pk.toFixed(2),
    ...scorecard.areas.map((area) => outOfTwo(area.score)),
    outOfTwo(scorecard.overall, true),
    `${scorecard.states.scored} / ${scorecard.total}`,
    {
      text: flagged ? "Not Militarily Effective" : "No critical failure",
      bold: flagged,
      color: flagged ? "#B3261E" : INK,
    },
  ];
}

/** @returns {string} How the period's runs and closeout apply to each system. */
function attributionNote(criteria) {
  const period = periodOf(criteria);
  const parts = [
    `${criteria.systems.length} ${criteria.systems.length === 1 ? "system was" : "systems were"} ` +
      `flown ${period.when}. Each is characterized from its own runs only; no figure below ` +
      "mixes runs from two systems.",
  ];
  if (criteria.systems.length > 1) {
    parts.push(period.shared);
  }
  if (criteria.unassignedRuns > 0) {
    parts.push(
      `${criteria.unassignedRuns} ${criteria.unassignedRuns === 1 ? "run names" : "runs name"} no interceptor ` +
        `and cannot be attributed to any system, so they appear in ${period.runLog} and section 5 but in no system's characterization.`
    );
  }
  return parts.join(" ");
}

/** @returns {string} A sentence naming areas left with no assessed rows, or "". */
function emptyAreasNote(scorecard) {
  const empty = (scorecard?.areas || []).filter((area) => area.total === 0).map((area) => `C${area.id}`);
  if (empty.length === 0) {
    return "";
  }
  return `${empty.join(" and ")} carry no assessed rows, so they read Not Assessed; section 12 lists why. `;
}

/** @returns {object[]} Section 8: every system side by side. */
export function buildSystemComparisonSection(criteria, stats) {
  const systems = criteria?.systems || [];
  if (systems.length === 0) {
    return noSystems(periodOf(criteria));
  }
  return [
    { text: attributionNote(criteria), fontSize: 8, margin: [0, 0, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: ["*", 26, 28, 34, 34, 34, 34, 34, 38, 40, 70],
        body: [
          headerRow(["System", "Runs", "Pk", "C1", "C2", "C3", "C4", "C5", "Overall", "Scored", "Status"]),
          ...systems.map((pkg) => comparisonRow(pkg, stats)),
        ],
      },
      layout: tableLayout(),
      fontSize: 7.5,
      margin: [0, 0, 0, 6],
    },
    {
      text:
        "C1 through C5 are the Core Capability Area scores out of 2; Overall is the equal-weight " +
        "average of the areas that carry a score. Pk is the outcome-based figure from section 5, " +
        `reported rather than scored. ${emptyAreasNote(systems[0].scorecard)}Each system's full ` +
        "characterization follows in section 9.",
      fontSize: 7.5,
      italics: true,
      color: "#5A6355",
      margin: [0, 0, 0, 8],
    },
  ];
}

/** @returns {object} A labelled divider inside one system's characterization. */
function partHeading(text) {
  return { text, bold: true, fontSize: 9.5, color: "#3E4A2E", margin: [0, 10, 0, 5] };
}

/** @returns {string} What this system flew. */
function systemNote(pkg) {
  const aborts = pkg.runs - pkg.redAirRuns;
  return (
    `${pkg.redAirRuns} intercept ${pkg.redAirRuns === 1 ? "run" : "runs"} and ${aborts} abort ` +
    `${aborts === 1 ? "run" : "runs"}` +
    (pkg.uasGroup ? `, predominantly against Group ${pkg.uasGroup} targets.` : ".")
  );
}

/**
 * @returns {object[]} The engagement timeline part, or nothing while the
 *   timeline is on the Not Repeatably Assessable list.
 */
function timelineBlocks(pkg) {
  if (isNotAssessable("timeline")) {
    return [];
  }
  return [partHeading("Engagement Timeline Analysis"), ...buildTimelineSection(pkg)];
}

/** @returns {object[]} One system's complete characterization. */
function systemBlocks(pkg, index, stats) {
  return [
    {
      text: `9.${index + 1}  ${pkg.system.name}`,
      bold: true,
      fontSize: 11,
      color: INK,
      margin: [0, index === 0 ? 4 : 0, 0, 4],
      pageBreak: index === 0 ? undefined : "before",
    },
    { text: systemNote(pkg), fontSize: 8, margin: [0, 0, 0, 4] },
    sourceLegend(),
    partHeading("MOP Results"),
    ...buildMopResults(pkg, systemStats(stats, pkg.system.name)),
    partHeading("KPP Threshold and Objective Compliance"),
    ...buildComplianceSection(pkg),
    partHeading("C4 Scorecard: Core Capability Areas"),
    ...buildScorecardSection(pkg),
    ...timelineBlocks(pkg),
    partHeading("Vendor Declarations and Derivations"),
    ...buildDeclarationSection(pkg),
  ];
}

const VERDICT_TEXT = Object.freeze({
  consistent: { text: "Consistent", color: "#2E7D32" },
  shortfall: { text: "Shortfall", color: "#B3261E" },
  inconsistent: { text: "Inconsistent", color: "#B3261E" },
  untested: { text: "Untested", color: "#5A6355" },
});

/** @returns {string} A cross-check figure with its unit, or a dash. */
function figure(value, unit) {
  return value === null || value === undefined ? "--" : `${value} ${unit}`.trim();
}

/** @returns {object} The derived values table, each with its full working. */
function derivationTable(derivations) {
  const body = derivations.map((entry) => [
    { text: entry.id, bold: true },
    entry.measure,
    entry.value === null ? "--" : `${typeof entry.value === "number" ? entry.value.toLocaleString("en-US") : entry.value} ${typeof entry.value === "number" ? entry.units : ""}`.trim(),
    { text: [entry.basis, ...(entry.warnings || []).map((warning) => ` Warning: ${warning}`)].join(""), fontSize: 6.5 },
  ]);
  return {
    table: { headerRows: 1, widths: [36, 80, 70, "*"], body: [headerRow(["ID", "Measure", "Value", "Working"]), ...body] },
    layout: tableLayout(),
    fontSize: 7,
    margin: [0, 0, 0, 8],
  };
}

/** @returns {object} Every declared claim held against what the runs showed. */
function crossCheckTable(checks) {
  const body = checks.map((check) => [
    { text: check.label === "Airframe" ? check.measure : `${check.label} ${check.measure}`, bold: true },
    figure(check.declared, check.unit),
    check.demonstrated === null ? "--" : `${figure(check.demonstrated, check.unit)} (n=${check.n})`,
    { text: VERDICT_TEXT[check.status].text, bold: true, color: VERDICT_TEXT[check.status].color },
    { text: `${check.note || ""} Source: ${check.source}.`, fontSize: 6.5 },
  ]);
  return {
    table: {
      headerRows: 1,
      widths: [96, 54, 70, 52, "*"],
      body: [headerRow(["Claim", "Declared", "Demonstrated", "Verdict", "Note"]), ...body],
    },
    layout: tableLayout(),
    fontSize: 7,
    margin: [0, 0, 0, 8],
  };
}

/**
 * The derivation engine's output for one system: what it computed and how,
 * which UAS groups the interceptor can outrun, and every declared claim
 * held against the runs.
 *
 * @returns {object[]}
 */
function buildDeclarationSection(pkg) {
  const blocks = [
    {
      text:
        "Values below are computed, never estimated: each shows its arithmetic, and one missing an " +
        "input names the input rather than guessing it. No probability is produced from a " +
        "specification; a vendor's performance claim is only ever compared with what the runs showed.",
      fontSize: 8,
      margin: [0, 0, 0, 6],
    },
    derivationTable(pkg.derivations || []),
  ];
  if ((pkg.speedAdvantage || []).length > 0) {
    blocks.push({ text: "Declared top speed against UAS group ceilings", bold: true, fontSize: 8, margin: [0, 2, 0, 3] });
    blocks.push({ ul: pkg.speedAdvantage.map((entry) => entry.text), fontSize: 7.5, margin: [0, 0, 0, 8] });
  }
  if ((pkg.crossChecks || []).length === 0) {
    blocks.push({ text: "No declared claim for this system can be compared with the runs.", italics: true, fontSize: 8 });
    return blocks;
  }
  blocks.push({ text: "Declared against demonstrated", bold: true, fontSize: 8, margin: [0, 2, 0, 3] });
  blocks.push(crossCheckTable(pkg.crossChecks));
  return blocks;
}

/** @returns {object[]} Section 9: the full characterization of every system. */
export function buildSystemSections(criteria, stats) {
  const systems = criteria?.systems || [];
  if (systems.length === 0) {
    return noSystems(periodOf(criteria));
  }
  return [mopIntro(), ...systems.flatMap((pkg, index) => systemBlocks(pkg, index, stats))];
}

/** @returns {object} The table of rows left out for one reason. */
function notAssessableTable(rows) {
  const body = rows.map((row) => [{ text: row.label, bold: true }, row.measure, { text: row.why, fontSize: 7 }]);
  return {
    table: { headerRows: 1, widths: [58, 110, "*"], body: [headerRow(["ID", "Measure", "Why it is not assessed"]), ...body] },
    layout: tableLayout(),
    fontSize: 7.5,
    margin: [0, 0, 0, 8],
  };
}

/**
 * The criteria this evaluation does not assess, grouped by reason, with the
 * reason for every row. Printing them keeps the exclusion visible, because
 * a row that silently vanishes from a formal evaluation reads as a pass.
 *
 * @returns {object[]}
 */
export function buildNotAssessableSection() {
  const groups = describeNotAssessable().filter((group) => group.rows.length > 0);
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const blocks = [
    {
      text:
        `The evaluation does not assess these ${count} criteria. A range scorer cannot measure them ` +
        "repeatably against a clear definition. They are left out of every score, count, and table " +
        "above rather than reported as gaps.",
      fontSize: 8,
      margin: [0, 0, 0, 8],
    },
  ];
  for (const group of groups) {
    blocks.push({ text: `${group.title} (${group.rows.length})`, bold: true, fontSize: 9, color: INK, margin: [0, 6, 0, 3] });
    blocks.push({ text: group.summary, fontSize: 7.5, italics: true, color: "#5A6355", margin: [0, 0, 0, 4] });
    blocks.push(notAssessableTable(group.rows));
  }
  return blocks;
}
