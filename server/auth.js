import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import express from "express";

/**
 * Session authentication with two shared passwords.
 * The server issues an HMAC-SHA256 signed token in an httpOnly cookie.
 * Roles: "scorer" (log and create) and "admin" (edit, delete, close days).
 */

const COOKIE_NAME = "ds_session";
const ROLE_RANK = Object.freeze({ scorer: 1, admin: 2 });
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Per-IP login attempt tracker. Private to this module. */
const loginAttempts = new Map();

/** @returns {string} Base64url encoding of the input string. */
function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** Constant-time string comparison via SHA-256 digests. */
function safeEquals(a, b) {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * @param {string} role
 * @param {string} secret
 * @param {number} hours
 * @returns {string} Signed session token.
 */
export function signToken(role, secret, hours) {
  const payload = JSON.stringify({ role, exp: Date.now() + hours * 3600 * 1000 });
  const encoded = toBase64Url(payload);
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {{ role: string } | null} Verified session, or null.
 */
export function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, signature] = parts;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeEquals(signature, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    if (payload.role !== "scorer" && payload.role !== "admin") {
      return null;
    }
    return { role: payload.role };
  } catch {
    return null;
  }
}

/** @returns {string} Value of a cookie from a Cookie header, or "". */
function readCookie(header, name) {
  if (!header) {
    return "";
  }
  const pairs = header.split(";").map((pair) => pair.trim());
  const match = pairs.find((pair) => pair.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : "";
}

/** @returns {boolean} True when this IP may attempt another login. */
function allowLoginAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  record.count += 1;
  return record.count <= MAX_LOGIN_ATTEMPTS;
}

/** @returns {string | null} Role matching the supplied password, or null. */
function matchRole(password, passwords) {
  if (safeEquals(password, passwords.admin)) {
    return "admin";
  }
  if (safeEquals(password, passwords.scorer)) {
    return "scorer";
  }
  return null;
}

/**
 * Middleware factory: attaches req.session from the cookie when valid.
 * @param {{ sessionSecret: string }} config
 */
export function sessionMiddleware(config) {
  return (req, _res, next) => {
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    req.session = token ? verifyToken(token, config.sessionSecret) : null;
    next();
  };
}

/**
 * Middleware factory: rejects requests below the required role.
 * @param {"scorer" | "admin"} minRole
 */
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.session) {
      return res.status(401).json({ success: false, error: "Sign in required." });
    }
    if (ROLE_RANK[req.session.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ success: false, error: "Admin access required." });
    }
    return next();
  };
}

/**
 * Router with login, logout, and session inspection endpoints.
 * @param {{ sessionSecret: string, sessionHours: number,
 *           passwords: { scorer: string, admin: string } }} config
 */
export function createAuthRouter(config) {
  const router = express.Router();

  router.post("/login", (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) {
      return res.status(400).json({ success: false, error: "Password is required." });
    }
    if (!allowLoginAttempt(req.ip || "unknown")) {
      return res
        .status(429)
        .json({ success: false, error: "Too many attempts. Try again in 15 minutes." });
    }
    const role = matchRole(password, config.passwords);
    if (!role) {
      return res.status(401).json({ success: false, error: "Invalid password." });
    }
    const token = signToken(role, config.sessionSecret, config.sessionHours);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: config.sessionHours * 3600 * 1000,
    });
    return res.json({ success: true, role });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME);
    return res.json({ success: true });
  });

  router.get("/session", (req, res) => {
    if (!req.session) {
      return res.status(401).json({ success: false, error: "No active session." });
    }
    return res.json({ success: true, role: req.session.role });
  });

  return router;
}
