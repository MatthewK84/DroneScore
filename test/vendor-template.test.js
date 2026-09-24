import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { isPerformanceClaim } from "../server/kpp-catalog.js";
import { isNotAssessable } from "../server/not-assessable.js";
import {
  AIRFRAME_INPUTS,
  buildTemplatePdf,
  readTemplatePdf,
  TEMPLATE_FIELDS,
  TEMPLATE_MARKER,
} from "../server/vendor-template.js";

/** @returns {object} The sheet field for a key. */
function fieldFor(key) {
  const field = TEMPLATE_FIELDS.find((entry) => entry.key === key);
  assert.ok(field, `${key} is not on the sheet`);
  return field;
}

/**
 * Fills a blank sheet the way a vendor would in a PDF reader.
 * @param {Record<string, string | [string, string]>} entries Value, or [value, unit].
 * @param {Record<string, string>} [meta]
 * @returns {Promise<Uint8Array>}
 */
async function fillSheet(entries, meta = {}) {
  const doc = await PDFDocument.load(await buildTemplatePdf());
  const form = doc.getForm();
  for (const [name, value] of Object.entries(meta)) {
    form.getTextField(`meta_${name}`).setText(value);
  }
  for (const [key, entry] of Object.entries(entries)) {
    const field = fieldFor(key);
    const [value, unit] = Array.isArray(entry) ? entry : [entry, null];
    if (field.input === "yesno") {
      form.getDropdown(field.name).select(value);
    } else {
      form.getTextField(field.name).setText(value);
    }
    if (unit) {
      form.getDropdown(field.unitName).select(unit);
    }
  }
  return doc.save();
}

/** The Guardian-1 spec sheet's figures, as its vendor would enter them. */
const GUARDIAN_1 = {
  "in.cruise_speed": ["160", "km/h"],
  "in.flight_time_loaded": "9",
  "in.flight_time_unloaded": "28",
  "in.working_range": "15",
  "in.max_altitude": "5,000",
  "in.interceptor_weight": "2.65",
  "8.7": "F405 / F722 / F743 flight controller, 70 A ESC",
  "8.8": "9 in carbon frame, 6 mm beams; 3115 900 KV motors; 8x8x2 propellers; 8S1P 8500 mAh battery",
  "INT-8": "Kinetic hit-to-kill",
};

test("every sheet field has a box, and every convertible number has a unit list", async () => {
  const doc = await PDFDocument.load(await buildTemplatePdf());
  const names = new Set(doc.getForm().getFields().map((field) => field.getName()));
  for (const field of TEMPLATE_FIELDS) {
    assert.ok(names.has(field.name), `no box for ${field.key}`);
    if (field.input === "number" && field.dimension !== null) {
      assert.ok(names.has(field.unitName), `no unit list for ${field.key}`);
    }
  }
  assert.ok(names.has("meta_template"));
});

test("the sheet asks what a vendor can know, and nothing the engine derives", () => {
  const keys = TEMPLATE_FIELDS.map((field) => field.key);
  for (const expected of ["5.5", "8.1", "INT-11", "9.2", "in.flight_time_loaded", "in.cruise_speed"]) {
    assert.ok(keys.includes(expected), `${expected} missing`);
  }
  for (const excluded of ["5.3", "5.8", "9.1", "INT-3", "5.4", "5.4a", "10.1", "11.1", "9.3", "6.1"]) {
    assert.equal(keys.includes(excluded), false, `${excluded} should not be asked of a vendor`);
  }
  for (const field of TEMPLATE_FIELDS) {
    assert.equal(field.claim, isPerformanceClaim(field.key), `${field.key} claim flag`);
  }
});

test("the sheet asks for no measure the evaluation does not assess", () => {
  const catalogKeys = TEMPLATE_FIELDS.map((field) => field.key).filter((key) => !key.startsWith("in."));
  assert.deepEqual(catalogKeys.filter(isNotAssessable), []);
  for (const excluded of ["1.1", "INT-1", "INT-5", "9.6", "8.3", "5.7"]) {
    assert.equal(catalogKeys.includes(excluded), false, `${excluded} is not assessed`);
  }
});

test("every airframe input stays and points to the unassessed rows it feeds", () => {
  const keys = TEMPLATE_FIELDS.map((field) => field.key);
  for (const input of AIRFRAME_INPUTS) {
    assert.ok(keys.includes(input.key), `${input.key} left the sheet`);
  }
  assert.match(fieldFor("in.cruise_speed").note, /^Reference only\. It feeds INT-3 Intercept Envelope, which this evaluation does not assess\.$/);
  assert.match(fieldFor("in.working_range").note, /INT-3 Intercept Envelope and MOP 3\.1\.3 Defeat Range/);
  assert.match(fieldFor("in.flight_time_loaded").note, /^It also feeds INT-3/);
  assert.equal(fieldFor("in.flight_time_unloaded").note, "", "it feeds only 9.1, which is assessed");
});

test("a sheet issued before the trim still imports, and its extra boxes are ignored", async () => {
  const doc = await PDFDocument.load(await fillSheet({ "5.5": "4", "in.cruise_speed": ["160", "km/h"] }));
  const form = doc.getForm();
  const old = form.createTextField("f_1_1");
  old.addToPage(doc.getPage(0), { x: 10, y: 10, width: 40, height: 10 });
  old.setText("3.5");
  const result = await readTemplatePdf(await doc.save());
  assert.equal(result.ok, true);
  assert.equal(result.values["5.5"], "4");
  assert.equal(result.values["in.cruise_speed"], "44.444");
  assert.equal(result.values["1.1"], undefined, "a measure no longer on the sheet is not imported");
});

test("a completed Guardian-1 sheet round-trips into catalog units", async () => {
  const bytes = await fillSheet(GUARDIAN_1, { vendor: "Tandem Defense", system: "Guardian-1 Interceptor" });
  const result = await readTemplatePdf(bytes);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.meta.vendor, "Tandem Defense");
  assert.equal(result.meta.system, "Guardian-1 Interceptor");
  assert.equal(result.values["in.cruise_speed"], "44.444", "160 km/h stored as m/s");
  assert.equal(result.values["in.flight_time_loaded"], "9");
  assert.equal(result.values["in.max_altitude"], "5000", "thousands separator read");
  assert.equal(result.values["in.working_range"], "15");
  assert.equal(result.values["8.7"], GUARDIAN_1["8.7"]);
  assert.equal(Object.keys(result.values).length, Object.keys(GUARDIAN_1).length, "blank boxes stay out");
});

test("yes/no answers read as yes, no, or not stated", async () => {
  const bytes = await fillSheet({ "7.5": "Yes", "INT-12": "No" });
  const { values } = await readTemplatePdf(bytes);
  assert.equal(values["7.5"], "yes");
  assert.equal(values["INT-12"], "no");
  assert.equal(values["8.1"], undefined, "a box left on Not stated says nothing");
});

test("what cannot be read exactly is rejected with its reason, never coerced", async () => {
  const bytes = await fillSheet({
    "in.cruise_speed": ["150-170", "km/h"],
    "in.working_range": "15 km",
    "5.5": "4",
  });
  const result = await readTemplatePdf(bytes);
  const reasons = Object.fromEntries(result.rejected.map((entry) => [entry.key, entry.reason]));
  assert.match(reasons["in.cruise_speed"], /range/);
  assert.match(reasons["in.working_range"], /Not a number/);
  assert.equal(result.values["5.5"], "4", "good values import alongside rejected ones");
  assert.equal(result.values["in.cruise_speed"], undefined);
});

test("a flattened or printed sheet is refused, not guessed at", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const result = await readTemplatePdf(await doc.save());
  assert.equal(result.ok, false);
  assert.match(result.error, /no form fields/);
});

test("a fillable PDF that is not our sheet is refused", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  doc.getForm().createTextField("name").addToPage(page, { x: 10, y: 10, width: 100, height: 20 });
  const result = await readTemplatePdf(await doc.save());
  assert.equal(result.ok, false);
  assert.match(result.error, /not a DroneScore vendor data sheet/);
});

test("a sheet from another layout version names both versions", async () => {
  const doc = await PDFDocument.load(await buildTemplatePdf());
  const marker = doc.getForm().getTextField("meta_template");
  marker.disableReadOnly();
  marker.setText("dronescore-vendor-sheet/0");
  const result = await readTemplatePdf(await doc.save());
  assert.equal(result.ok, false);
  assert.match(result.error, /dronescore-vendor-sheet\/0/);
  assert.match(result.error, new RegExp(TEMPLATE_MARKER));
});

test("bytes that are not a PDF are refused", async () => {
  const result = await readTemplatePdf(Buffer.from("not a pdf at all"));
  assert.equal(result.ok, false);
  assert.match(result.error, /not a readable PDF/);
});
