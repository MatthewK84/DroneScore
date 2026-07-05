/**
 * National Weather Service client. Free, no API key, US coverage.
 * Every failure path returns null so scoring never blocks on weather.
 */

const FETCH_TIMEOUT_MS = 6000;
const OBSERVATION_TTL_MS = 10 * 60 * 1000;
const STATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Private caches keyed by rounded coordinates. */
const stationCache = new Map();
const observationCache = new Map();

/** @returns {string} Cache key from coordinates rounded to ~1 km. */
function coordKey(latitude, longitude) {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

/**
 * @param {string} url
 * @param {string} userAgent
 * @returns {Promise<object | null>} Parsed JSON, or null on any failure.
 */
async function fetchJson(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/geo+json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<string | null>} Observation station URL for the point. */
async function findStationUrl(latitude, longitude, userAgent) {
  const key = coordKey(latitude, longitude);
  const cached = stationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }
  const point = await fetchJson(
    `https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`,
    userAgent
  );
  const stationsUrl = point?.properties?.observationStations;
  if (typeof stationsUrl !== "string") {
    return null;
  }
  const stations = await fetchJson(stationsUrl, userAgent);
  const stationId = stations?.features?.[0]?.properties?.stationIdentifier;
  if (typeof stationId !== "string") {
    return null;
  }
  const url = `https://api.weather.gov/stations/${stationId}/observations/latest`;
  stationCache.set(key, { url, expiresAt: Date.now() + STATION_TTL_MS });
  return url;
}

/** @returns {number | null} Rounded value, or null when input is not numeric. */
function roundOrNull(value, digits) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Normalizes an NWS observation into the shape stored on engagements. */
function normalizeObservation(raw) {
  const props = raw?.properties;
  if (!props) {
    return null;
  }
  const tempC = props.temperature?.value;
  const windKmh = props.windSpeed?.value;
  const gustKmh = props.windGust?.value;
  const visibilityM = props.visibility?.value;
  return {
    tempC: roundOrNull(tempC, 1),
    tempF: roundOrNull(typeof tempC === "number" ? tempC * 1.8 + 32 : null, 0),
    windKts: roundOrNull(typeof windKmh === "number" ? windKmh * 0.53996 : null, 0),
    windMph: roundOrNull(typeof windKmh === "number" ? windKmh * 0.621371 : null, 0),
    gustKts: roundOrNull(typeof gustKmh === "number" ? gustKmh * 0.53996 : null, 0),
    gustMph: roundOrNull(typeof gustKmh === "number" ? gustKmh * 0.621371 : null, 0),
    windDirDeg: roundOrNull(props.windDirection?.value, 0),
    visibilityKm: roundOrNull(
      typeof visibilityM === "number" ? visibilityM / 1000 : null,
      1
    ),
    visibilitySM: roundOrNull(
      typeof visibilityM === "number" ? visibilityM / 1609.34 : null,
      1
    ),
    humidityPct: roundOrNull(props.relativeHumidity?.value, 0),
    description: typeof props.textDescription === "string" ? props.textDescription : "",
    observedAt: typeof props.timestamp === "string" ? props.timestamp : null,
  };
}

/**
 * Latest observed weather near a point. Cached for ten minutes.
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} userAgent
 * @returns {Promise<object | null>}
 */
export async function getCurrentWeather(latitude, longitude, userAgent) {
  const key = coordKey(latitude, longitude);
  const cached = observationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.observation;
  }
  const stationUrl = await findStationUrl(latitude, longitude, userAgent);
  if (!stationUrl) {
    return null;
  }
  const raw = await fetchJson(stationUrl, userAgent);
  const observation = normalizeObservation(raw);
  if (observation) {
    observationCache.set(key, {
      observation,
      expiresAt: Date.now() + OBSERVATION_TTL_MS,
    });
  }
  return observation;
}
