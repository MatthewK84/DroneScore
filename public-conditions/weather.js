/**
 * Weather client for the standalone conditions service. Fetches the
 * latest National Weather Service observation and, critically, keeps the
 * last good reading. If a later fetch fails, it serves the last reading
 * marked stale rather than returning nothing, so the public board never
 * goes blank on a brief outage.
 */

const FETCH_TIMEOUT_MS = 6000;
const OBSERVATION_TTL_MS = 10 * 60 * 1000;
const STATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Module-scoped caches. Encapsulated here, never attached to globals. */
let stationCache = { url: null, expiresAt: 0 };
let lastGood = { observation: null, at: 0 };

/**
 * @param {string} url
 * @param {string} userAgent
 * @returns {Promise<object|null>} Parsed JSON, or null on any failure.
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

/**
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} userAgent
 * @returns {Promise<string|null>} Latest-observation URL for the point.
 */
async function findStationUrl(latitude, longitude, userAgent) {
  if (stationCache.url && stationCache.expiresAt > Date.now()) {
    return stationCache.url;
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
  stationCache = { url, expiresAt: Date.now() + STATION_TTL_MS };
  return url;
}

/** @returns {number|null} Rounded value, or null when input is not numeric. */
function roundOrNull(value, digits) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** @returns {object|null} Normalized observation, or null. */
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
    visibilityKm: roundOrNull(typeof visibilityM === "number" ? visibilityM / 1000 : null, 1),
    visibilitySM: roundOrNull(typeof visibilityM === "number" ? visibilityM / 1609.34 : null, 1),
    humidityPct: roundOrNull(props.relativeHumidity?.value, 0),
    description: typeof props.textDescription === "string" ? props.textDescription : "",
    observedAt: typeof props.timestamp === "string" ? props.timestamp : null,
  };
}

/** @returns {Promise<object|null>} A fresh observation, or null on failure. */
async function fetchObservation(latitude, longitude, userAgent) {
  const stationUrl = await findStationUrl(latitude, longitude, userAgent);
  if (!stationUrl) {
    return null;
  }
  const raw = await fetchJson(stationUrl, userAgent);
  return normalizeObservation(raw);
}

/**
 * Returns the current range weather, preferring a fresh reading and
 * falling back to the last good one, marked stale, on failure.
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} userAgent
 * @returns {Promise<{ observation: object|null, observedAt: number, stale: boolean }>}
 */
export async function getRangeWeather(latitude, longitude, userAgent) {
  if (lastGood.observation && Date.now() - lastGood.at < OBSERVATION_TTL_MS) {
    return { observation: lastGood.observation, observedAt: lastGood.at, stale: false };
  }
  const fresh = await fetchObservation(latitude, longitude, userAgent);
  if (fresh) {
    lastGood = { observation: fresh, at: Date.now() };
    return { observation: fresh, observedAt: lastGood.at, stale: false };
  }
  if (lastGood.observation) {
    return { observation: lastGood.observation, observedAt: lastGood.at, stale: true };
  }
  return { observation: null, observedAt: 0, stale: false };
}
