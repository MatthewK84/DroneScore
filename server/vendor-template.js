/**
 * The JIATF-401 vendor data sheet: a fillable PDF built from the criteria
 * catalog, and the reader that turns a completed one back into values.
 *
 * The sheet exists so that nobody has to interpret a vendor's marketing
 * spec on test day. Every box is one catalog measure, in a stated unit,
 * so a completed sheet imports exactly: no extraction, no judgment about
 * which figure on a brochure the vendor meant.
 *
 * The field list is generated, not maintained. A measure added to the
 * catalog appears on the next sheet with no change here; the only lists
 * in this file are the measures deliberately left off, each with its
 * reason, and the wording that closes the traps real spec sheets set.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { catalogByCategory, isPerformanceClaim } from "./kpp-catalog.js";
import { convert, parseNumber, roundStored, unitSpecFor, unitsOf } from "./units.js";

/** Identifies a completed sheet as ours, and which layout it follows. */
export const TEMPLATE_MARKER = "dronescore-vendor-sheet/1";

/** Categories a vendor cannot speak to: they are measured on operators or judged by the evaluator. */
const EVALUATOR_CATEGORIES = Object.freeze(["Operator & System Usability", "Mission Impact & Risk"]);

/** Measures the derivation engine computes, so asking for them would invite a second, conflicting figure. */
const DERIVED_IDS = Object.freeze(["5.3", "5.8", "9.1", "INT-3"]);

/** Non-kinetic defeat variants, not asked of a kinetic interceptor. */
const NON_KINETIC_IDS = Object.freeze(["5.2a", "5.2b", "5.2c", "5.2d", "5.4a", "5.4b", "5.4c", "5.4d"]);

/** Costs of the evaluated period, which the evaluator knows and the vendor does not. */
const EVALUATOR_IDS = Object.freeze(["9.3", "9.7"]);

/**
 * Wording that closes the traps vendor spec sheets set. Each note answers
 * a specific misreading: an interceptor's weight entered as the system's,
 * the fastest target it catches entered as its own speed, and so on.
 */
const FIELD_NOTES = Object.freeze({
  "INT-1": "The interceptor's own top speed, not the speed of the fastest target it can catch.",
  "INT-11": "Time to ready the next interceptor for launch after one is expended.",
  "5.5": "Interceptors the launcher holds ready to fire.",
  "9.2": "The whole fielded system as transported: launcher, sensors, C2, and a full load of interceptors. One interceptor's weight goes under Interceptor weight.",
  "9.6": "Cost of one expendable interceptor, payload included. Used to derive cost per engagement.",
  "1.5": "The sensor's detection ceiling. The interceptor's own ceiling goes under Maximum interceptor altitude.",
});

/**
 * Airframe figures the derivation engine needs that are not criteria in
 * their own right. Each one is phrased against the misreading it prevents.
 */
export const AIRFRAME_INPUTS = Object.freeze([
  { key: "in.cruise_speed", measure: "Cruise speed", dimension: "speed", unit: "m/s", description: "Speed the interceptor sustains in transit to an engagement." },
  { key: "in.flight_time_loaded", measure: "Flight time with mission payload", dimension: "time", unit: "min", description: "Endurance carrying the payload it engages with. This, not unloaded endurance, bounds an intercept." },
  { key: "in.flight_time_unloaded", measure: "Flight time without payload", dimension: "time", unit: "min", description: "Endurance with no payload. Reported for reference only." },
  { key: "in.working_range", measure: "Working engagement range", dimension: "distance", unit: "km", description: "Furthest distance from launch at which the interceptor can engage a target." },
  { key: "in.max_altitude", measure: "Maximum interceptor altitude", dimension: "distance", unit: "m", description: "Highest altitude above ground level the interceptor itself can reach." },
  { key: "in.interceptor_weight", measure: "Interceptor weight, flight-ready", dimension: "mass", unit: "kg", description: "One interceptor with battery and payload. The whole system's weight goes under KPP 9.2." },
]);

/** Keys of every airframe input, for the profile's key validation. */
export const AIRFRAME_INPUT_KEYS = Object.freeze(AIRFRAME_INPUTS.map((input) => input.key));

/** @returns {boolean} True for a derivation input key the profile may store. */
export function isAirframeInputKey(key) {
  return AIRFRAME_INPUT_KEYS.includes(key);
}

/** Header fields identifying who filled the sheet, stored with the document, never scored. */
const META_FIELDS = Object.freeze([
  { name: "meta_vendor", label: "Vendor" },
  { name: "meta_system", label: "System and variant" },
  { name: "meta_version", label: "Configuration / software version" },
  { name: "meta_date", label: "Date completed" },
  { name: "meta_poc", label: "Point of contact" },
]);

const YES_NO_OPTIONS = Object.freeze(["Not stated", "Yes", "No"]);

/** @returns {boolean} True when a catalog entry belongs on the vendor sheet. */
function onSheet(entry) {
  return (
    entry.tier === "system" &&
    !EVALUATOR_CATEGORIES.includes(entry.category) &&
    !DERIVED_IDS.includes(entry.id) &&
    !NON_KINETIC_IDS.includes(entry.id) &&
    !EVALUATOR_IDS.includes(entry.id)
  );
}

/** @returns {string} An AcroForm-safe field name. Dots would nest fields, so none survive. */
function fieldName(prefix, key) {
  return `${prefix}_${key.replace(/[^A-Za-z0-9]/g, "_")}`;
}

/** @returns {object} A sheet field built from one catalog entry. */
function catalogField(entry) {
  const spec = entry.input === "number" ? unitSpecFor(entry.units) : null;
  if (entry.input === "number" && spec === null) {
    throw new Error(`Catalog entry ${entry.id} uses unit "${entry.units}" with no storage rule in units.js.`);
  }
  return {
    key: entry.id,
    name: fieldName("f", entry.id),
    unitName: fieldName("u", entry.id),
    label: entry.label,
    measure: entry.measure,
    description: entry.description,
    note: FIELD_NOTES[entry.id] || "",
    input: entry.input,
    dimension: spec?.dimension ?? null,
    unit: spec?.unit ?? "",
    claim: isPerformanceClaim(entry.id),
  };
}

/** @returns {object} A sheet field built from one airframe input. */
function airframeField(input) {
  return {
    key: input.key,
    name: fieldName("f", input.key),
    unitName: fieldName("u", input.key),
    label: "Airframe",
    measure: input.measure,
    description: input.description,
    note: "",
    input: "number",
    dimension: input.dimension,
    unit: input.unit,
    claim: false,
  };
}

/**
 * The sheet's sections, in catalog order, with the airframe inputs placed
 * directly before the interceptor-specific metrics they explain.
 *
 * @returns {{ title: string, fields: object[] }[]}
 */
function buildSections() {
  const sections = [];
  for (const category of catalogByCategory()) {
    if (category.name === "Interceptor-Specific") {
      sections.push({ title: "Interceptor Airframe", fields: AIRFRAME_INPUTS.map(airframeField) });
    }
    const fields = category.entries.filter(onSheet).map(catalogField);
    if (fields.length > 0) {
      sections.push({ title: category.name, fields });
    }
  }
  return sections;
}

/** @type {readonly { title: string, fields: object[] }[]} */
export const TEMPLATE_SECTIONS = Object.freeze(buildSections());

/** @type {readonly object[]} Every field on the sheet, flattened. */
export const TEMPLATE_FIELDS = Object.freeze(TEMPLATE_SECTIONS.flatMap((section) => section.fields));

/** Field names must be unique, or two measures would share one box. */
const NAMES = TEMPLATE_FIELDS.flatMap((field) => [field.name, field.unitName]);
if (new Set(NAMES).size !== NAMES.length) {
  throw new Error("Two vendor sheet fields map to the same form field name.");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PAGE = Object.freeze({ width: 612, height: 792, margin: 48, footer: 30 });
const LABEL_WIDTH = 318;
const INPUT_X = PAGE.margin + LABEL_WIDTH + 12;
const INPUT_WIDTH = PAGE.width - PAGE.margin - INPUT_X;
const INK = rgb(0.1, 0.125, 0.094);
const MUTED = rgb(0.353, 0.388, 0.333);
const OLIVE = rgb(0.243, 0.29, 0.18);
const FILL = rgb(0.914, 0.925, 0.886);
const CLAIM = rgb(0.72, 0.33, 0.05);
const BOX = rgb(0.72, 0.74, 0.69);

/**
 * Breaks text into lines that fit a width. The standard PDF fonts only
 * encode Windows-1252, so anything outside it is replaced rather than
 * allowed to abort the whole sheet.
 *
 * @returns {string[]}
 */
function wrap(text, font, size, width) {
  const safe = text.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022]/g, "?");
  const lines = [];
  let line = "";
  for (const word of safe.split(/\s+/).filter((part) => part.length > 0)) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= width || line === "") {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  return lines;
}

/** Tracks the page being drawn on and how far down it the next row starts. */
function createCursor(doc) {
  return { doc, page: doc.addPage([PAGE.width, PAGE.height]), y: PAGE.height - PAGE.margin };
}

/** Starts a new page when the next block would run into the footer. */
function ensureSpace(cursor, height) {
  if (cursor.y - height >= PAGE.margin + PAGE.footer) {
    return;
  }
  cursor.page = cursor.doc.addPage([PAGE.width, PAGE.height]);
  cursor.y = PAGE.height - PAGE.margin;
}

/** Draws wrapped lines from the cursor down and returns the height used. */
function drawLines(cursor, lines, { x, size, font, color, leading }) {
  let offset = 0;
  for (const text of lines) {
    cursor.page.drawText(text, { x, y: cursor.y - offset - size, size, font, color });
    offset += leading;
  }
  return offset;
}

const INSTRUCTIONS =
  "Enter one value per box, and choose its unit from the list beside it. Leave a box empty " +
  "when the system lacks the capability or the value is not known: do not estimate. A range " +
  "such as 290-340 is refused on import; enter the value the system is guaranteed to meet. " +
  "Measures marked PERFORMANCE CLAIM are shown beside test results and never scored from this " +
  "sheet. Save the completed form as a fillable PDF. Printing to PDF or flattening the form " +
  "removes the boxes, and a sheet without its boxes cannot be imported.";

/** Draws the title block, instructions, and the identifying fields. */
function drawHeader(cursor, fonts, form) {
  const { page } = cursor;
  page.drawText("JIATF-401 C-sUAS Vendor Data Sheet", { x: PAGE.margin, y: cursor.y - 18, size: 18, font: fonts.bold, color: INK });
  page.drawText("Interceptor system declaration, completed by the vendor before test execution", {
    x: PAGE.margin, y: cursor.y - 34, size: 9, font: fonts.regular, color: MUTED,
  });
  cursor.y -= 50;
  const lines = wrap(INSTRUCTIONS, fonts.regular, 8.5, PAGE.width - PAGE.margin * 2);
  cursor.y -= drawLines(cursor, lines, { x: PAGE.margin, size: 8.5, font: fonts.regular, color: INK, leading: 11.5 }) + 10;
  for (const meta of META_FIELDS) {
    page.drawText(meta.label, { x: PAGE.margin, y: cursor.y - 13, size: 9, font: fonts.bold, color: INK });
    const box = form.createTextField(meta.name);
    box.addToPage(page, { x: PAGE.margin + 190, y: cursor.y - 18, width: PAGE.width - PAGE.margin * 2 - 190, height: 18, borderColor: BOX, borderWidth: 1 });
    box.setFontSize(9);
    cursor.y -= 24;
  }
  const marker = form.createTextField("meta_template");
  marker.setText(TEMPLATE_MARKER);
  marker.addToPage(page, { x: PAGE.margin, y: cursor.y - 12, width: 180, height: 10, borderWidth: 0 });
  marker.setFontSize(6);
  marker.enableReadOnly();
  cursor.y -= 22;
}

/** Draws a section heading bar. */
function drawSectionHeading(cursor, fonts, title) {
  ensureSpace(cursor, 60);
  cursor.page.drawRectangle({ x: PAGE.margin, y: cursor.y - 20, width: PAGE.width - PAGE.margin * 2, height: 20, color: FILL });
  cursor.page.drawText(title.toUpperCase(), { x: PAGE.margin + 8, y: cursor.y - 14, size: 9.5, font: fonts.bold, color: OLIVE });
  cursor.y -= 28;
}

/** @returns {string[][]} The label, description, and note lines for one field. */
function fieldText(field, fonts) {
  const heading = field.label === "Airframe" ? field.measure : `${field.label}  ${field.measure}`;
  const described = field.note ? `${field.description} ${field.note}` : field.description;
  return {
    heading: wrap(heading, fonts.bold, 9, LABEL_WIDTH),
    body: wrap(described, fonts.regular, 7.5, LABEL_WIDTH),
    claim: field.claim ? ["PERFORMANCE CLAIM: shown beside test results, not scored from this sheet."] : [],
  };
}

/** Draws the input widgets for one field and returns the height they need. */
function drawInputs(cursor, fonts, form, field) {
  const top = cursor.y;
  if (field.input === "yesno") {
    const choice = form.createDropdown(field.name);
    choice.addOptions([...YES_NO_OPTIONS]);
    choice.select(YES_NO_OPTIONS[0]);
    choice.addToPage(cursor.page, { x: INPUT_X, y: top - 18, width: 110, height: 18, borderColor: BOX, borderWidth: 1 });
    choice.setFontSize(9);
    return 18;
  }
  if (field.input !== "number") {
    const text = form.createTextField(field.name);
    text.enableMultiline();
    text.addToPage(cursor.page, { x: INPUT_X, y: top - 40, width: INPUT_WIDTH, height: 40, borderColor: BOX, borderWidth: 1 });
    text.setFontSize(8);
    return 40;
  }
  const value = form.createTextField(field.name);
  value.addToPage(cursor.page, { x: INPUT_X, y: top - 18, width: 110, height: 18, borderColor: BOX, borderWidth: 1 });
  value.setFontSize(9);
  if (field.dimension === null) {
    cursor.page.drawText(field.unit, { x: INPUT_X + 118, y: top - 13, size: 9, font: fonts.regular, color: MUTED });
    return 18;
  }
  const unit = form.createDropdown(field.unitName);
  unit.addOptions(unitsOf(field.dimension));
  unit.select(field.unit);
  unit.addToPage(cursor.page, { x: INPUT_X + 116, y: top - 18, width: INPUT_WIDTH - 116, height: 18, borderColor: BOX, borderWidth: 1 });
  unit.setFontSize(9);
  return 18;
}

/** Draws one field's row: its label and description on the left, its boxes on the right. */
function drawField(cursor, fonts, form, field) {
  const text = fieldText(field, fonts);
  const textHeight = (text.heading.length * 11) + (text.body.length * 9.5) + (text.claim.length * 9.5);
  const inputHeight = field.input === "number" || field.input === "yesno" ? 18 : 40;
  const rowHeight = Math.max(textHeight, inputHeight);
  ensureSpace(cursor, rowHeight + 8);
  const top = cursor.y;
  let used = drawLines(cursor, text.heading, { x: PAGE.margin, size: 9, font: fonts.bold, color: INK, leading: 11 });
  cursor.y = top - used;
  used += drawLines(cursor, text.body, { x: PAGE.margin, size: 7.5, font: fonts.regular, color: MUTED, leading: 9.5 });
  cursor.y = top - used;
  drawLines(cursor, text.claim, { x: PAGE.margin, size: 7, font: fonts.bold, color: CLAIM, leading: 9.5 });
  cursor.y = top;
  drawInputs(cursor, fonts, form, field);
  cursor.y = top - rowHeight - 8;
}

/** Numbers every page and dates the sheet. */
function drawFooters(doc, fonts, generatedOn) {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText(`JIATF-401 vendor data sheet  |  ${TEMPLATE_MARKER}  |  generated ${generatedOn}`, {
      x: PAGE.margin, y: PAGE.margin - 18, size: 7, font: fonts.regular, color: MUTED,
    });
    page.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE.width - PAGE.margin - 50, y: PAGE.margin - 18, size: 7, font: fonts.regular, color: MUTED,
    });
  });
}

/**
 * Builds a blank, fillable vendor data sheet from the current catalog.
 *
 * @param {Date} [now] Generation date printed in the footer.
 * @returns {Promise<Uint8Array>} PDF bytes.
 */
export async function buildTemplatePdf(now = new Date()) {
  const doc = await PDFDocument.create();
  doc.setTitle("JIATF-401 C-sUAS Vendor Data Sheet");
  doc.setSubject(TEMPLATE_MARKER);
  doc.setCreator("DroneScore");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const form = doc.getForm();
  const cursor = createCursor(doc);
  drawHeader(cursor, fonts, form);
  for (const section of TEMPLATE_SECTIONS) {
    drawSectionHeading(cursor, fonts, section.title);
    for (const field of section.fields) {
      drawField(cursor, fonts, form, field);
    }
  }
  drawFooters(doc, fonts, now.toISOString().slice(0, 10));
  form.updateFieldAppearances(fonts.regular);
  return doc.save();
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** @returns {string} The typed text of a text field, or "". */
function textOf(field) {
  if (!field || typeof field.getText !== "function") {
    return "";
  }
  return (field.getText() || "").trim();
}

/** @returns {string} The chosen option of a dropdown, or "". */
function choiceOf(field) {
  if (!field || typeof field.getSelected !== "function") {
    return "";
  }
  return field.getSelected()[0] || "";
}

/** Percentages and 0-100 scores cannot exceed their scale. */
const BOUNDED_UNITS = Object.freeze(["%", "0-100"]);

/**
 * Reads one numeric field into its stored unit.
 * @returns {{ value?: string, reason?: string, raw: string }}
 */
function readNumber(field, byName) {
  const raw = textOf(byName.get(field.name));
  const parsed = parseNumber(raw);
  if (parsed.empty) {
    return { raw };
  }
  if (parsed.error) {
    return { raw, reason: parsed.error };
  }
  if (BOUNDED_UNITS.includes(field.unit) && parsed.value > 100) {
    return { raw, reason: `Cannot exceed 100 on a ${field.unit} scale.` };
  }
  if (field.dimension === null) {
    return { raw, value: String(roundStored(parsed.value)) };
  }
  const chosen = choiceOf(byName.get(field.unitName)) || field.unit;
  const converted = convert(parsed.value, chosen, field.unit, field.dimension);
  if (converted === null) {
    return { raw, reason: `Unit "${chosen}" is not a ${field.dimension} unit.` };
  }
  const shown = chosen === field.unit ? raw : `${raw} ${chosen}`;
  return { raw: shown, value: String(roundStored(converted)) };
}

/** @returns {{ value?: string, reason?: string, raw: string }} One field's reading. */
function readField(field, byName) {
  if (field.input === "number") {
    return readNumber(field, byName);
  }
  if (field.input === "yesno") {
    const choice = choiceOf(byName.get(field.name));
    const value = choice === "Yes" ? "yes" : choice === "No" ? "no" : undefined;
    return { raw: choice, value };
  }
  const text = textOf(byName.get(field.name));
  if (text.length > 2000) {
    return { raw: `${text.slice(0, 60)}...`, reason: "Longer than 2,000 characters." };
  }
  return { raw: text, value: text.length > 0 ? text : undefined };
}

/**
 * Reads a completed vendor data sheet.
 *
 * Values arrive converted into the catalog's units, keyed by catalog id or
 * airframe input key, ready for a system profile. Anything that cannot be
 * read exactly is returned in `rejected` with the reason, never coerced.
 *
 * @param {Uint8Array | Buffer} bytes
 * @returns {Promise<{ ok: true, meta: object, values: object, rejected: object[] } | { ok: false, error: string }>}
 */
export async function readTemplatePdf(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return { ok: false, error: "The file is not a readable PDF." };
  }
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return { ok: false, error: "The PDF opened, but its form is damaged and cannot be read. Ask the vendor to save the sheet again." };
  }
  if (fields.length === 0) {
    return {
      ok: false,
      error: "The PDF has no form fields. It was probably printed to PDF or flattened; ask the vendor for the saved fillable form.",
    };
  }
  const byName = new Map(fields.map((field) => [field.getName(), field]));
  const marker = textOf(byName.get("meta_template"));
  if (marker !== TEMPLATE_MARKER) {
    return {
      ok: false,
      error: marker
        ? `This sheet follows layout "${marker}", and this version of DroneScore reads "${TEMPLATE_MARKER}".`
        : "This PDF has form fields, but it is not a DroneScore vendor data sheet.",
    };
  }
  const meta = Object.fromEntries(META_FIELDS.map((entry) => [entry.name.slice(5), textOf(byName.get(entry.name))]));
  const values = {};
  const rejected = [];
  for (const field of TEMPLATE_FIELDS) {
    const reading = readField(field, byName);
    if (reading.reason) {
      rejected.push({ key: field.key, label: field.label === "Airframe" ? field.measure : `${field.label} ${field.measure}`, raw: reading.raw, reason: reading.reason });
    } else if (reading.value !== undefined) {
      values[field.key] = reading.value;
    }
  }
  return { ok: true, meta, values, rejected };
}
