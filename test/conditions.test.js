import test from "node:test";
import assert from "node:assert/strict";
import { assessFlyingConditions } from "../server/conditions.js";

/** @returns {string} The rating for a group given a weather observation. */
function ratingFor(weather, group) {
  const match = assessFlyingConditions(weather).find((entry) => entry.group === group);
  return match.rating;
}

test("group 1 wind bands follow the thresholds", () => {
  assert.equal(ratingFor({ windMph: 10 }, "1"), "GO");
  assert.equal(ratingFor({ windMph: 20 }, "1"), "CAUTION");
  assert.equal(ratingFor({ windMph: 30 }, "1"), "NO-FLY");
});

test("wind scales by group, so one wind rates each group differently", () => {
  const weather = { windMph: 40 };
  assert.equal(ratingFor(weather, "1"), "NO-FLY");
  assert.equal(ratingFor(weather, "2"), "NO-FLY");
  assert.equal(ratingFor(weather, "3"), "CAUTION");
  assert.equal(ratingFor(weather, "4"), "GO");
  assert.equal(ratingFor(weather, "5"), "GO");
});

test("gust drives the rating when it exceeds sustained wind", () => {
  assert.equal(ratingFor({ windMph: 5, gustMph: 28 }, "1"), "NO-FLY");
  assert.equal(ratingFor({ windMph: 5, gustMph: 18 }, "1"), "CAUTION");
});

test("thunderstorm forces NO-FLY across all groups", () => {
  const list = assessFlyingConditions({ windMph: 3, description: "Thunderstorm in vicinity" });
  assert.ok(list.every((entry) => entry.rating === "NO-FLY"));
});

test("temperature bands apply per group", () => {
  assert.equal(ratingFor({ tempF: 120 }, "1"), "NO-FLY");
  assert.equal(ratingFor({ tempF: 20 }, "1"), "CAUTION");
  assert.equal(ratingFor({ tempF: 70 }, "1"), "GO");
});

test("visibility applies to small groups only", () => {
  const weather = { windMph: 3, tempF: 70, visibilitySM: 0.5 };
  assert.equal(ratingFor(weather, "1"), "NO-FLY");
  assert.equal(ratingFor(weather, "4"), "GO");
});

test("null weather yields UNKNOWN for every group", () => {
  const list = assessFlyingConditions(null);
  assert.equal(list.length, 5);
  assert.ok(list.every((entry) => entry.rating === "UNKNOWN"));
});
