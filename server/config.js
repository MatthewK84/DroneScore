import { randomBytes } from "node:crypto";

/**
 * Central configuration. Every environment variable the server reads
 * is declared here so deployment requirements stay visible in one file.
 */

/** @returns {string[]} Non-empty recipient addresses from RECIPIENT_1..4. */
function readRecipients() {
  const keys = ["RECIPIENT_1", "RECIPIENT_2", "RECIPIENT_3", "RECIPIENT_4"];
  return keys
    .map((key) => (process.env[key] || "").trim())
    .filter((value) => value.length > 0);
}

/** @returns {string} SESSION_SECRET, or a random per-boot secret with a warning. */
function readSessionSecret() {
  const fromEnv = (process.env.SESSION_SECRET || "").trim();
  if (fromEnv.length >= 16) {
    return fromEnv;
  }
  console.warn(
    "SESSION_SECRET is unset or too short. Using a random secret; " +
      "all sessions will invalidate on restart. Set SESSION_SECRET in Railway."
  );
  return randomBytes(32).toString("hex");
}

/** @returns {{ scorer: string, admin: string }} Shared access passwords. */
function readPasswords() {
  const scorer = (process.env.SCORER_PASSWORD || "").trim();
  const admin = (process.env.ADMIN_PASSWORD || "").trim();
  if (!scorer || !admin) {
    console.warn(
      "SCORER_PASSWORD or ADMIN_PASSWORD is unset. Using insecure defaults. " +
        "Set both in Railway before real use."
    );
  }
  return { scorer: scorer || "scorer", admin: admin || "admin" };
}

/** @returns {number} Parsed float env var, or the fallback. */
function readFloat(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = Object.freeze({
  port: Number.parseInt(process.env.PORT || "3001", 10),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: (process.env.DATABASE_SSL || "false").toLowerCase() === "true",
  sessionSecret: readSessionSecret(),
  passwords: readPasswords(),
  sessionHours: 12,
  sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  fromAddress: process.env.FROM_ADDRESS || "",
  recipients: readRecipients(),
  timezone: process.env.APP_TIMEZONE || "America/New_York",
  defaultLocationName:
    process.env.DEFAULT_LOCATION_NAME || "Poinsett Range, Shaw AFB, SC",
  defaultLatitude: readFloat("DEFAULT_LATITUDE", 33.85),
  defaultLongitude: readFloat("DEFAULT_LONGITUDE", -80.54),
  worClassification: process.env.WOR_CLASSIFICATION || "UNCLASSIFIED",
  nwsUserAgent:
    process.env.NWS_USER_AGENT || "DroneSmoke/2.0 (range scoring application)",
});
