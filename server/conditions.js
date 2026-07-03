/**
 * Flying-conditions estimator. Pure functions that translate a weather
 * observation into a GO / CAUTION / NO-GO rating for each UAS group.
 * Thresholds are conservative range-safety heuristics, not regulatory
 * limits, and are grouped here so they are easy to tune in one place.
 */

const RANK = Object.freeze({ "GO": 0, "CAUTION": 1, "NO-GO": 2 });

const GROUP_LIMITS = Object.freeze([
  { group: "1", label: "Group 1", detail: "0-20 lb", windGoKts: 15, windCautionKts: 22 },
  { group: "2", label: "Group 2", detail: "21-55 lb", windGoKts: 20, windCautionKts: 28 },
  { group: "3", label: "Group 3", detail: "56-1320 lb", windGoKts: 28, windCautionKts: 38 },
  { group: "4", label: "Group 4", detail: ">1320 lb, <FL180", windGoKts: 35, windCautionKts: 45 },
  { group: "5", label: "Group 5", detail: ">1320 lb, >FL180", windGoKts: 40, windCautionKts: 50 },
]);

/** @returns {string} The more restrictive of two GO/CAUTION/NO-GO ratings. */
function worse(current, candidate) {
  return RANK[candidate] > RANK[current] ? candidate : current;
}

/**
 * @param {number|null} windKts
 * @param {object} limits
 * @returns {{ rating: string, driver: string|null }} Wind contribution for a group.
 */
function windContribution(windKts, limits) {
  if (typeof windKts !== "number") {
    return { rating: "GO", driver: null };
  }
  if (windKts > limits.windCautionKts) {
    return { rating: "NO-GO", driver: `Wind ${windKts} kt over ${limits.windCautionKts} kt limit` };
  }
  if (windKts > limits.windGoKts) {
    return { rating: "CAUTION", driver: `Wind ${windKts} kt near ${limits.windGoKts} kt threshold` };
  }
  return { rating: "GO", driver: null };
}

/**
 * @param {object} weather Normalized observation.
 * @returns {{ rating: string, drivers: string[] }} Hazards shared across all groups.
 */
function sharedHazards(weather) {
  const drivers = [];
  let rating = "GO";
  const { visibilityKm, tempF, description } = weather;
  if (typeof visibilityKm === "number" && visibilityKm < 1.6) {
    rating = worse(rating, "NO-GO");
    drivers.push("Visibility below 1 SM");
  } else if (typeof visibilityKm === "number" && visibilityKm < 4.8) {
    rating = worse(rating, "CAUTION");
    drivers.push("Reduced visibility");
  }
  if (typeof tempF === "number" && tempF <= 0) {
    rating = worse(rating, "NO-GO");
    drivers.push("Severe cold, battery risk");
  } else if (typeof tempF === "number" && (tempF < 20 || tempF > 105)) {
    rating = worse(rating, "CAUTION");
    drivers.push("Temperature extreme, battery risk");
  }
  const text = (description || "").toLowerCase();
  if (/(thunder|lightning|storm|tornado)/.test(text)) {
    rating = worse(rating, "NO-GO");
    drivers.push("Thunderstorm activity");
  } else if (/(snow|ice|sleet|freezing|rain|fog|mist|haze)/.test(text)) {
    rating = worse(rating, "CAUTION");
    drivers.push(`Precipitation or obscuration (${description})`);
  }
  return { rating, drivers };
}

/**
 * @param {object} weather
 * @param {object} limits
 * @param {{ rating: string, drivers: string[] }} hazards
 * @returns {object} Assessment for one UAS group.
 */
function assessGroup(weather, limits, hazards) {
  const wind = windContribution(weather.windKts, limits);
  const rating = worse(wind.rating, hazards.rating);
  const drivers = [];
  if (wind.driver) {
    drivers.push(wind.driver);
  }
  drivers.push(...hazards.drivers);
  if (rating === "GO" && drivers.length === 0) {
    drivers.push("Within limits for this class");
  }
  return { group: limits.group, label: limits.label, detail: limits.detail, rating, drivers };
}

/**
 * @param {object|null} weather Normalized observation, or null when unavailable.
 * @returns {object[]} One flying-conditions assessment per UAS group.
 */
export function assessFlyingConditions(weather) {
  if (!weather) {
    return GROUP_LIMITS.map((limits) => ({
      group: limits.group,
      label: limits.label,
      detail: limits.detail,
      rating: "UNKNOWN",
      drivers: ["Live weather unavailable"],
    }));
  }
  const hazards = sharedHazards(weather);
  return GROUP_LIMITS.map((limits) => assessGroup(weather, limits, hazards));
}
