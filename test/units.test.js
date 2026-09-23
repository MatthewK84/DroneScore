import assert from "node:assert/strict";
import test from "node:test";
import { convert, parseNumber, roundStored, unitSpecFor, unitsOf } from "../server/units.js";
import { KPP_CATALOG } from "../server/kpp-catalog.js";

test("speeds convert through metres per second", () => {
  assert.equal(roundStored(convert(290, "km/h", "m/s", "speed")), 80.556);
  assert.equal(roundStored(convert(100, "kt", "m/s", "speed")), 51.444);
  assert.equal(roundStored(convert(50, "mph", "m/s", "speed")), 22.352);
});

test("distances, masses, and times convert within their dimension", () => {
  assert.equal(convert(15, "km", "m", "distance"), 15000);
  assert.equal(roundStored(convert(1, "nmi", "km", "distance")), 1.852);
  assert.equal(roundStored(convert(10, "lb", "kg", "mass")), 4.536);
  assert.equal(convert(3, "min", "s", "time"), 180);
});

test("a unit from another dimension is refused, never guessed", () => {
  assert.equal(convert(5, "kg", "m", "distance"), null);
  assert.equal(convert(5, "km", "m", "speed"), null);
  assert.deepEqual(unitsOf("volume"), []);
});

test("one number is read, with or without thousands separators", () => {
  assert.deepEqual(parseNumber("2.65"), { value: 2.65 });
  assert.deepEqual(parseNumber(" 5,000 "), { value: 5000 });
  assert.deepEqual(parseNumber("310,000.50"), { value: 310000.5 });
  assert.deepEqual(parseNumber(""), { empty: true });
  assert.deepEqual(parseNumber(undefined), { empty: true });
});

test("ranges, negatives, and prose are refused with a reason", () => {
  assert.match(parseNumber("290-340").error, /range/);
  assert.match(parseNumber("290 – 340").error, /range/);
  assert.match(parseNumber("290 to 340").error, /range/);
  assert.match(parseNumber("-4").error, /negative/);
  assert.match(parseNumber("340 km/h").error, /Not a number/);
  assert.match(parseNumber("about 15").error, /Not a number/);
  assert.match(parseNumber("1,20").error, /Not a number/);
});

test("every numeric catalog unit has a storage rule", () => {
  const unmapped = KPP_CATALOG.filter((entry) => entry.input === "number" && unitSpecFor(entry.units) === null);
  assert.deepEqual(unmapped.map((entry) => `${entry.id} (${entry.units})`), []);
});

test("stored values name the one unit they are in, and currency reads as currency", async () => {
  const { formatQuantity, storedUnitLabel } = await import("../server/units.js");
  assert.equal(storedUnitLabel("m/s or kt"), "m/s");
  assert.equal(storedUnitLabel("sec / min"), "s");
  assert.equal(storedUnitLabel("0-100"), "0-100");
  assert.equal(formatQuantity(80.556, "m/s or kt"), "80.556 m/s");
  assert.equal(formatQuantity(9840, "$"), "$9,840");
  assert.equal(formatQuantity(295000, "$"), "$295,000");
  assert.equal(formatQuantity(95, "sec / min"), "95 s");
  assert.equal(formatQuantity(5000, "m"), "5,000 m");
});
