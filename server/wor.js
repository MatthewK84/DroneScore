import PdfPrinter from "pdfmake";
import SunCalc from "suncalc";
import { compactDate, formatDateLong, formatTimeLocal } from "./time.js";

/**
 * Warfighter Observation Report generator. Produces a vector PDF,
 * so output stays sharp at any print size. Uses the PDF standard
 * Helvetica family; no font files ship with the app.
 */

const FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

const INK = "#1A2018";
const OLIVE = "#3E4A2E";
const LINE = "#C9CDbf".toUpperCase();
const HEADER_FILL = "#E9ECE2";

const OUTCOME_LABELS = Object.freeze({
  success: "Success",
  unsuccessful: "Miss",
  not_attempted: "No Attempt",
});

/** @returns {string} Value as text, or "N/A" when null or undefined. */
function orNa(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }
  return `${value}${suffix}`;
}

/** @returns {string} Pk formatted to two decimals, or "N/A". */
function fmtPk(pk) {
  return pk === null ? "N/A" : pk.toFixed(2);
}

/** @returns {object} Section heading block. */
function heading(number, title) {
  return {
    text: `SECTION ${number}. ${title.toUpperCase()}`,
    style: "sectionHead",
    margin: [0, 14, 0, 6],
  };
}

/** @returns {object} A bordered two-column key/value table. */
function kvTable(pairs) {
  return {
    table: {
      widths: [150, "*"],
      body: pairs.map(([key, value]) => [
        { text: key, bold: true, fillColor: HEADER_FILL },
        { text: value },
      ]),
    },
    layout: { hLineColor: () => LINE, vLineColor: () => LINE },
    fontSize: 8.5,
  };
}

/** @returns {object} Sunrise and sunset strings for the day. */
function solarTimes(day, timezone) {
  const noon = new Date(`${day.day_date}T12:00:00Z`);
  const times = SunCalc.getTimes(noon, Number(day.latitude), Number(day.longitude));
  return {
    sunrise: `${formatTimeLocal(times.sunrise, timezone)}L`,
    sunset: `${formatTimeLocal(times.sunset, timezone)}L`,
  };
}

/** @returns {string} BLUF paragraph built from day statistics. */
function buildBluf(day, stats) {
  const o = stats.overall;
  if (o.total === 0) {
    return (
      `Scorers logged no engagements at ${day.location_name} on this date. ` +
      "This report documents conditions and scorer observations only."
    );
  }
  const parts = [
    `Scorers logged ${o.total} engagements at ${day.location_name}.`,
    `Interceptors achieved ${o.successes} successful intercepts in ${o.attempts} attempts for an overall Pk of ${fmtPk(o.pk)}.`,
  ];
  const ranked = stats.byInterceptor.filter((row) => row.attempts > 0);
  if (ranked.length > 1) {
    const best = [...ranked].sort((a, b) => (b.pk ?? 0) - (a.pk ?? 0))[0];
    parts.push(`${best.label} recorded the highest Pk at ${fmtPk(best.pk)}.`);
  }
  return parts.join(" ");
}

/** @returns {object} Section 2 mission overview content. */
function buildOverview(day, engagements, timezone) {
  const solar = solarTimes(day, timezone);
  const stamps = engagements.map((row) => new Date(row.occurred_at));
  const window =
    stamps.length > 0
      ? `${formatTimeLocal(stamps[0], timezone)}L to ${formatTimeLocal(stamps[stamps.length - 1], timezone)}L`
      : "No engagements logged";
  return kvTable([
    ["Date", formatDateLong(day.day_date)],
    ["Location", day.location_name],
    ["Coordinates", `${Number(day.latitude).toFixed(4)}, ${Number(day.longitude).toFixed(4)}`],
    ["Sunrise / Sunset", `${solar.sunrise} / ${solar.sunset}`],
    ["Scoring Window", window],
  ]);
}

/** @returns {object[]} Section 3 environmental conditions content. */
function buildConditions(day, stats) {
  const blocks = [];
  const wx = stats.weather;
  if (wx) {
    blocks.push(
      kvTable([
        ["Temperature", `${wx.tempMinF} to ${wx.tempMaxF} F`],
        [
          "Wind",
          wx.windMinKts === null ? "N/A" : `${wx.windMinKts} to ${wx.windMaxKts} kts`,
        ],
        ["Observed Conditions", wx.descriptions.join(", ") || "N/A"],
        ["Weather Samples", `${wx.samples} automated observations (NWS)`],
      ])
    );
  } else {
    blocks.push({
      text: "Automated weather observations were unavailable for this day.",
      italics: true,
    });
  }
  if (day.weather_note) {
    blocks.push({
      text: [{ text: "Scorer weather note: ", bold: true }, day.weather_note],
      margin: [0, 6, 0, 0],
    });
  }
  return blocks;
}

/** @returns {object} Section 4 engagement log table. */
function buildEngagementLog(engagements, timezone) {
  const header = ["Time", "Sortie", "Target", "Interceptor", "Outcome", "TTI (s)", "Range (m)"].map(
    (text) => ({ text, bold: true, fillColor: HEADER_FILL })
  );
  const rows = engagements.map((row) => [
    `${formatTimeLocal(new Date(row.occurred_at), timezone)}L`,
    orNa(row.sortie),
    orNa(row.drone_name),
    orNa(row.interceptor_name),
    OUTCOME_LABELS[row.outcome] || row.outcome,
    orNa(row.time_to_intercept_s),
    orNa(row.engagement_range_m),
  ]);
  return {
    table: { headerRows: 1, widths: [34, 44, "*", "*", 52, 34, 44], body: [header, ...rows] },
    layout: { hLineColor: () => LINE, vLineColor: () => LINE },
    fontSize: 8,
  };
}

/** @returns {object} A performance rollup table for one grouping. */
function statsTable(title, rows) {
  const header = ["", "Attempts", "Successes", "Misses", "Pk", "Avg TTI (s)", "Avg Range (m)"].map(
    (text) => ({ text: text || title, bold: true, fillColor: HEADER_FILL })
  );
  const body = rows.map((row) => [
    row.label,
    row.attempts,
    row.successes,
    row.misses,
    fmtPk(row.pk),
    orNa(row.avgTimeToInterceptS),
    orNa(row.avgRangeM),
  ]);
  return {
    table: { headerRows: 1, widths: ["*", 46, 50, 40, 32, 54, 64], body: [header, ...body] },
    layout: { hLineColor: () => LINE, vLineColor: () => LINE },
    fontSize: 8,
    margin: [0, 0, 0, 10],
  };
}

/** @returns {object[]} Section 6 scorer observation blocks. */
function buildObservations(engagements, timezone) {
  const noted = engagements.filter((row) => row.notes && row.notes.trim().length > 0);
  if (noted.length === 0) {
    return [{ text: "Scorers recorded no free text observations.", italics: true }];
  }
  return noted.map((row) => ({
    margin: [0, 0, 0, 6],
    text: [
      {
        text: `${formatTimeLocal(new Date(row.occurred_at), timezone)}L  ${orNa(row.interceptor_name)} vs ${orNa(row.drone_name)}: `,
        bold: true,
      },
      row.notes.trim(),
    ],
  }));
}

/** @returns {string} Deterministic assessment narrative. */
function buildNarrative(stats) {
  const sentences = [];
  for (const row of stats.byInterceptor.filter((r) => r.attempts > 0)) {
    let sentence = `${row.label} attempted ${row.attempts} intercepts and succeeded ${row.successes} times (Pk ${fmtPk(row.pk)}).`;
    if (row.avgTimeToInterceptS !== null) {
      sentence += ` Average time to intercept was ${row.avgTimeToInterceptS} seconds.`;
    }
    sentences.push(sentence);
  }
  for (const period of stats.byPeriod.filter((p) => p.attempts > 0)) {
    sentences.push(`${period.label}: ${period.successes} of ${period.attempts} attempts succeeded (Pk ${fmtPk(period.pk)}).`);
  }
  if (sentences.length === 0) {
    sentences.push("No attempted intercepts were available for assessment.");
  }
  sentences.push("The DRONESMOKE scoring application generated this report from live scorer entries.");
  return sentences.join(" ");
}

/** @returns {object} Complete pdfmake document definition. */
function buildDocDefinition(input) {
  const { day, engagements, stats, controlNumber, timezone, classification, generatedAt } = input;
  return {
    pageSize: "LETTER",
    pageMargins: [46, 58, 46, 52],
    defaultStyle: { font: "Helvetica", fontSize: 9, color: INK, lineHeight: 1.25 },
    styles: {
      sectionHead: { fontSize: 10, bold: true, color: OLIVE },
      title: { fontSize: 17, bold: true, color: INK },
    },
    header: {
      text: classification,
      alignment: "center",
      bold: true,
      fontSize: 9,
      margin: [0, 22, 0, 0],
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: controlNumber, fontSize: 7.5 },
        { text: classification, alignment: "center", bold: true, fontSize: 9 },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", fontSize: 7.5 },
      ],
      margin: [46, 14, 46, 0],
    }),
    content: [
      { text: "WARFIGHTER OBSERVATION REPORT", style: "title", alignment: "center" },
      {
        text: `DRONESMOKE C-sUAS Interceptor Evaluation  |  ${controlNumber}`,
        alignment: "center",
        fontSize: 9.5,
        margin: [0, 4, 0, 2],
      },
      {
        text: `Generated ${generatedAt}`,
        alignment: "center",
        fontSize: 8,
        color: "#5A6355",
      },
      heading(1, "Bottom Line Up Front"),
      { text: buildBluf(day, stats) },
      heading(2, "Mission Overview"),
      buildOverview(day, engagements, timezone),
      heading(3, "Environmental Conditions"),
      ...buildConditions(day, stats),
      heading(4, "Engagement Log"),
      buildEngagementLog(engagements, timezone),
      heading(5, "Performance Analysis"),
      statsTable("By Interceptor", stats.byInterceptor),
      statsTable("By Target", stats.byDrone),
      statsTable("By UAS Group", stats.byGroup),
      statsTable("By Period", stats.byPeriod),
      heading(6, "Scorer Observations"),
      ...buildObservations(engagements, timezone),
      heading(7, "Assessment"),
      { text: buildNarrative(stats) },
    ],
  };
}

/**
 * @param {object} docDefinition
 * @returns {Promise<Buffer>} Rendered PDF bytes.
 */
function renderPdf(docDefinition) {
  return new Promise((resolve, reject) => {
    try {
      const printer = new PdfPrinter(FONTS);
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Builds the WOR for one day.
 * @param {object} input { day, engagements, stats, reportSeq, timezone, classification }
 * @returns {Promise<{ controlNumber: string, buffer: Buffer }>}
 */
export async function generateWor(input) {
  const sequence = String(input.reportSeq).padStart(2, "0");
  const controlNumber = `WOR-${compactDate(input.day.day_date)}-${sequence}`;
  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: input.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const buffer = await renderPdf(
    buildDocDefinition({ ...input, controlNumber, generatedAt })
  );
  return { controlNumber, buffer };
}
