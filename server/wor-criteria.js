import { CRITERIA } from "./criteria.js";

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

const STATUS_LABELS = Object.freeze({
  objective: "Objective",
  threshold: "Threshold",
  short: "Fell short",
  not_established: "Not established",
  not_measured: "Not measured",
  stated: "Stated",
});

const STATUS_COLORS = Object.freeze({
  objective: "#2E7D32",
  threshold: "#3E4A2E",
  short: "#B3261E",
  not_established: "#B98A00",
  not_measured: "#5A6355",
  stated: "#5A6355",
});

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
    return "No data";
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
        `Section 5 reports Pk ${outcomePk.toFixed(2)} and MOP 3.1.2 reports ` +
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

/** @returns {object[]} Section 8: derived MOP results per criterion. */
export function buildCriteriaSection(criteria, stats) {
  if (!criteria) {
    return [{ text: "Capability characterization data was unavailable.", italics: true }];
  }
  const blocks = [
    {
      text:
        "Measures of Performance derived under section 4.1. The Basis column states " +
        "whether each figure was captured at the kill chain stage picker, inferred " +
        "from the run outcome, or taken from day closeout entries. An inferred " +
        "proportion is not a measurement of that stage and should not be read as one.",
      fontSize: 8,
      italics: true,
      margin: [0, 0, 0, 8],
    },
    ...reconcilePk(criteria, stats),
  ];
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
  if (row.detail) {
    return row.detail.length > 60 ? `${row.detail.slice(0, 57)}...` : row.detail;
  }
  if (row.measured === null || row.measured === undefined) {
    return "--";
  }
  return `${row.measured} ${row.units}`.trim();
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
export function buildComplianceSection(criteria) {
  if (!criteria) {
    return [{ text: "KPP compliance data was unavailable.", italics: true }];
  }
  const { summary, system } = criteria;
  const blocks = [
    {
      text:
        `Compliance is reported for ${system.name || "the system under test"}` +
        (system.others.length > 0
          ? `. Runs were also logged for ${system.others.join(", ")}; those systems are not blended into this table.`
          : ".") +
        ` Achieved Objective on ${summary.objective}, met Threshold on ${summary.threshold}, ` +
        `fell short on ${summary.short}. ${summary.not_established} KPPs have no benchmark ` +
        `established and ${summary.not_measured} were not measured on this date. ` +
        "Section 4.2 requires benchmarks to be documented before test execution, so a " +
        "KPP marked not established is an open action against the evaluation, not a pass.",
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
        `points on this date. ${matrix.unassigned} logged runs were not assigned to a profile ` +
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

/** @returns {object[]} Section 11: the basis behind every benchmark used. */
export function buildBasisSection(criteria) {
  const withBasis = (criteria?.compliance || []).filter((row) => row.basis && row.basis.length > 0);
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
    const sharing = withBasis.filter((other) => other.basis === row.basis).map((other) => other.label);
    blocks.push({
      margin: [0, 0, 0, 5],
      fontSize: 8,
      text: [{ text: `${sharing.join(", ")}: `, bold: true }, row.basis],
    });
  }
  return blocks;
}
