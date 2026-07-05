/**
 * Flying-conditions estimator. Ratings follow the DoD UAS Group operational
 * thresholds: wind in mph, visibility in statute miles, temperature in F,
 * across three bands (GO, CAUTION, NO-FLY). Wind uses the greater of
 * sustained and gust, reflecting the two-thirds wind principle that gusts,
 * not just steady wind, drive the limit. Thresholds live here so a range
 * can tune them in one place, and they are covered by unit tests.
 */

const RANK = Object.freeze({ "GO": 0, "CAUTION": 1, "NO-FLY": 2 });

const GROUP_LIMITS = Object.freeze([
  {
    group: "1",
    label: "Group 1",
    detail: "Micro/Mini, below 1,200 ft AGL",
    windGoMph: 15,
    windCautionMph: 25,
    tempGoLowF: 32,
    tempGoHighF: 104,
    tempNoflyLowF: 0,
    tempNoflyHighF: 115,
    visibilityApplies: true,
  },
  {
    group: "2",
    label: "Group 2",
    detail: "Small, below 3,500 ft AGL",
    windGoMph: 20,
    windCautionMph: 30,
    tempGoLowF: 20,
    tempGoHighF: 110,
    tempNoflyLowF: -4,
    tempNoflyHighF: 120,
    visibilityApplies: true,
  },
  {
    group: "3",
    label: "Group 3",
    detail: "Medium, below 18,000 ft MSL",
    windGoMph: 30,
    windCautionMph: 45,
    tempGoLowF: 0,
    tempGoHighF: 115,
    tempNoflyLowF: -20,
    tempNoflyHighF: 125,
    visibilityApplies: true,
  },
  {
    group: "4",
    label: "Group 4",
    detail: "Large, up to 18,000 ft MSL",
    windGoMph: 40,
    windCautionMph: 55,
    tempGoLowF: -30,
    tempGoHighF: 120,
    tempNoflyLowF: -50,
    tempNoflyHighF: 130,
    visibilityApplies: false,
  },
  {
    group: "5",
    label: "Group 5",
    detail: "Strategic, above 18,000 ft MSL",
    windGoMph: 45,
    windCautionMph: 65,
    tempGoLowF: -40,
    tempGoHighF: 125,
    tempNoflyLowF: -80,
    tempNoflyHighF: null,
    visibilityApplies: false,
  },
]);

/** @returns {string} The more restrictive of two ratings. */
function worse(current, candidate) {
  return RANK[candidate] > RANK[current] ? candidate : current;
}

/** @returns {string} The input with its first letter capitalized. */
function capitalize(text) {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * @param {object} weather
 * @returns {{ mph: number|null, gustDriven: boolean }} Effective wind, the
 *   greater of sustained and gust.
 */
function effectiveWind(weather) {
  const sustained = typeof weather.windMph === "number" ? weather.windMph : null;
  const gust = typeof weather.gustMph === "number" ? weather.gustMph : null;
  if (sustained === null && gust === null) {
    return { mph: null, gustDriven: false };
  }
  const steady = sustained ?? 0;
  const peak = gust ?? 0;
  return { mph: Math.max(steady, peak), gustDriven: peak > steady };
}

/**
 * @param {object} weather
 * @param {object} limits
 * @returns {{ rating: string, driver: string|null }}
 */
function windRating(weather, limits) {
  const { mph, gustDriven } = effectiveWind(weather);
  if (mph === null) {
    return { rating: "GO", driver: null };
  }
  const source = gustDriven ? "gust" : "wind";
  if (mph > limits.windCautionMph) {
    return { rating: "NO-FLY", driver: `${capitalize(source)} ${mph} mph over ${limits.windCautionMph} mph limit` };
  }
  if (mph > limits.windGoMph) {
    return { rating: "CAUTION", driver: `${capitalize(source)} ${mph} mph near ${limits.windGoMph} mph threshold` };
  }
  return { rating: "GO", driver: null };
}

/**
 * @param {object} weather
 * @param {object} limits
 * @returns {{ rating: string, driver: string|null }}
 */
function visibilityRating(weather, limits) {
  if (!limits.visibilityApplies || typeof weather.visibilitySM !== "number") {
    return { rating: "GO", driver: null };
  }
  const sm = weather.visibilitySM;
  if (sm < 1) {
    return { rating: "NO-FLY", driver: `Visibility ${sm} SM below 1 SM` };
  }
  if (sm < 3) {
    return { rating: "CAUTION", driver: `Visibility ${sm} SM below 3 SM` };
  }
  return { rating: "GO", driver: null };
}

/**
 * @param {object} weather
 * @param {object} limits
 * @returns {{ rating: string, driver: string|null }}
 */
function temperatureRating(weather, limits) {
  const tempF = weather.tempF;
  if (typeof tempF !== "number") {
    return { rating: "GO", driver: null };
  }
  const belowNofly = limits.tempNoflyLowF !== null && tempF < limits.tempNoflyLowF;
  const aboveNofly = limits.tempNoflyHighF !== null && tempF > limits.tempNoflyHighF;
  if (belowNofly || aboveNofly) {
    return { rating: "NO-FLY", driver: `Temp ${tempF} F outside safe envelope` };
  }
  if (tempF < limits.tempGoLowF || tempF > limits.tempGoHighF) {
    return { rating: "CAUTION", driver: `Temp ${tempF} F degrades battery or avionics` };
  }
  return { rating: "GO", driver: null };
}

/**
 * @param {object} weather
 * @returns {{ rating: string, driver: string|null }} Hazard from sky conditions.
 */
function weatherHazard(weather) {
  const text = (weather.description || "").toLowerCase();
  if (/(thunder|lightning|tornado|squall)/.test(text)) {
    return { rating: "NO-FLY", driver: "Thunderstorm activity" };
  }
  if (/(snow|ice|sleet|freezing|rain|fog|mist|haze)/.test(text)) {
    return { rating: "CAUTION", driver: `Precipitation or obscuration (${weather.description})` };
  }
  return { rating: "GO", driver: null };
}

/**
 * @param {object} weather
 * @param {object} limits
 * @returns {object} Assessment for one UAS group.
 */
function assessGroup(weather, limits) {
  const contributions = [
    windRating(weather, limits),
    visibilityRating(weather, limits),
    temperatureRating(weather, limits),
    weatherHazard(weather),
  ];
  let rating = "GO";
  const drivers = [];
  for (const contribution of contributions) {
    rating = worse(rating, contribution.rating);
    if (contribution.driver) {
      drivers.push(contribution.driver);
    }
  }
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
  return GROUP_LIMITS.map((limits) => assessGroup(weather, limits));
}
