import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessFlyingConditions } from "./conditions.js";
import { getRangeWeather } from "./weather.js";

/**
 * Standalone public conditions service. A single, dependency-free Node
 * process that serves one page and one JSON endpoint: current range
 * weather plus a flying-conditions rating per UAS group. It shares no
 * data with the scoring app, so it stays available on its own HTTPS URL
 * regardless of what happens on the operator side.
 */

const ROOT = dirname(fileURLToPath(import.meta.url));

/** @returns {number} Parsed float env var, or the fallback. */
function readFloat(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CONFIG = Object.freeze({
  port: Number.parseInt(process.env.PORT || "8080", 10),
  latitude: readFloat("RANGE_LATITUDE", 33.85),
  longitude: readFloat("RANGE_LONGITUDE", -80.54),
  location: process.env.RANGE_LOCATION || "Poinsett Range, Shaw AFB, SC",
  userAgent: process.env.NWS_USER_AGENT || "DroneSmokeConditions/1.0 (set-a-contact-email)",
  title: process.env.APP_TITLE || "Drone Smoke Range Conditions",
});

const PAGE = await readFile(join(ROOT, "public", "index.html"), "utf8");

/** @returns {Promise<object>} The full conditions payload for the page. */
async function buildConditions() {
  const { observation, observedAt, stale } = await getRangeWeather(
    CONFIG.latitude,
    CONFIG.longitude,
    CONFIG.userAgent
  );
  return {
    location: CONFIG.location,
    title: CONFIG.title,
    weather: observation,
    stale,
    observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    assessments: assessFlyingConditions(observation),
    generatedAt: new Date().toISOString(),
  };
}

/** Writes a JSON response with no-cache headers. */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Writes the HTML page, injecting the configured title. */
function sendPage(res) {
  const html = PAGE.replaceAll("{{TITLE}}", CONFIG.title);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

/** Routes a single request. Kept small with early returns per path. */
async function handle(req, res) {
  const url = (req.url || "/").split("?")[0];
  if (req.method !== "GET") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }
  if (url === "/healthz") {
    return sendJson(res, 200, { success: true });
  }
  if (url === "/api/conditions") {
    try {
      const payload = await buildConditions();
      return sendJson(res, 200, { success: true, ...payload });
    } catch (error) {
      console.error("Conditions build failed:", error?.message);
      return sendJson(res, 500, { success: false, error: "Failed to load conditions." });
    }
  }
  if (url === "/" || url === "/index.html") {
    return sendPage(res);
  }
  return sendJson(res, 404, { success: false, error: "Not found." });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("Unhandled request error:", error?.message);
    if (!res.headersSent) {
      sendJson(res, 500, { success: false, error: "Server error." });
    }
  });
});

server.listen(CONFIG.port, "0.0.0.0", () => {
  console.log(`Conditions service running on port ${CONFIG.port}`);
  console.log(`Range: ${CONFIG.location} (${CONFIG.latitude}, ${CONFIG.longitude})`);
});
