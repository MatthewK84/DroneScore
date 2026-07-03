import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthRouter, sessionMiddleware } from "./auth.js";
import { config } from "./config.js";
import { createPool, migrate } from "./db.js";
import { createMailer } from "./mailer.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { createOperationsRouter } from "./routes/operations.js";
import { createPublicRouter } from "./routes/public.js";
import { createSupportRouter } from "./routes/support.js";

/**
 * DRONESMOKE server. One Express process serves the JSON API and the
 * built React frontend, matching the original single-service layout
 * that Railway deploys without extra configuration.
 */

/** Adds a tiny cookie helper so auth.js can set cookies without a dependency. */
function cookieSupport(_req, res, next) {
  res.cookie = (name, value, options) => {
    const parts = [`${name}=${value}`, "Path=/"];
    if (options.httpOnly) {
      parts.push("HttpOnly");
    }
    if (options.sameSite) {
      parts.push(`SameSite=${options.sameSite}`);
    }
    if (options.secure) {
      parts.push("Secure");
    }
    if (typeof options.maxAge === "number") {
      parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    }
    res.append("Set-Cookie", parts.join("; "));
    return res;
  };
  res.clearCookie = (name) => {
    res.append("Set-Cookie", `${name}=; Path=/; HttpOnly; Max-Age=0`);
    return res;
  };
  next();
}

/** Builds the Express app with all middleware and routers attached. */
function buildApp(pool, mailer) {
  const app = express();
  const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieSupport);
  app.use(sessionMiddleware(config));

  app.use("/api/auth", createAuthRouter(config));
  app.use("/api", createPublicRouter(pool, config));
  app.use("/api", createCatalogRouter(pool));
  app.use("/api", createOperationsRouter(pool, config, mailer));
  app.use("/api", createSupportRouter(pool));

  app.use(express.static(join(rootDir, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(join(rootDir, "dist", "index.html"));
  });
  return app;
}

/** Boots the database, then starts the HTTP listener. */
async function start() {
  const pool = createPool(config);
  try {
    await migrate(pool);
  } catch (error) {
    console.error("Database migration failed.");
    console.error(`  message: ${error?.message || "(empty)"}`);
    console.error(`  code: ${error?.code || "n/a"}`);
    if (Array.isArray(error?.errors)) {
      for (const inner of error.errors) {
        console.error(`  cause: ${inner?.message || inner}`);
      }
    }
    console.error(
      "  hint: confirm DATABASE_URL points at the Postgres service. " +
        "For managed Postgres over public networking, set DATABASE_SSL=true."
    );
    process.exit(1);
  }
  const mailer = createMailer(config);
  const app = buildApp(pool, mailer);
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`DRONESMOKE server running on port ${config.port}`);
    console.log(`Email delivery ${mailer.enabled ? "enabled" : "disabled"}.`);
  });
}

start().catch((error) => {
  console.error("Failed to start:", error?.message);
  process.exit(1);
});
