import pg from "pg";

/**
 * Database access. Creates the pool, runs idempotent migrations at boot,
 * and seeds the three original interceptor platforms.
 */

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS drones (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    uas_group TEXT NOT NULL DEFAULT '',
    airframe TEXT NOT NULL DEFAULT '',
    weight_kg NUMERIC,
    max_speed_ms NUMERIC,
    propulsion TEXT NOT NULL DEFAULT '',
    control_link TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS interceptors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    vendor TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS days (
    id BIGSERIAL PRIMARY KEY,
    day_date DATE NOT NULL UNIQUE,
    location_name TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    weather_note TEXT NOT NULL DEFAULT '',
    closed_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS engagements (
    id BIGSERIAL PRIMARY KEY,
    day_id BIGINT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    sortie TEXT NOT NULL DEFAULT '',
    drone_id BIGINT REFERENCES drones(id) ON DELETE SET NULL,
    interceptor_id BIGINT REFERENCES interceptors(id) ON DELETE SET NULL,
    outcome TEXT NOT NULL,
    time_to_intercept_s NUMERIC,
    engagement_range_m NUMERIC,
    altitude_m NUMERIC,
    notes TEXT NOT NULL DEFAULT '',
    weather JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS wor_reports (
    id BIGSERIAL PRIMARY KEY,
    day_id BIGINT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    control_number TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    pdf BYTEA NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schedule_events (
    id BIGSERIAL PRIMARY KEY,
    event_date DATE NOT NULL,
    time_label TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    rank TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_engagements_day ON engagements(day_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wor_reports_day ON wor_reports(day_id)`,
  // Added after initial release. Existing rows default to red_air, so historical
  // reports keep the exact numbers they were generated with. Admins re-classify
  // abort runs from the Score tab; nothing is rewritten automatically.
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'red_air'`,
];

const SEED_INTERCEPTORS = ["SICA", "REDDI", "WASP"];

/**
 * @param {{ databaseUrl: string, databaseSsl: boolean }} options
 * @returns {pg.Pool}
 */
export function createPool(options) {
  return new pg.Pool({
    connectionString: options.databaseUrl,
    ssl: options.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 10,
  });
}

/**
 * Runs idempotent schema creation and seeds interceptors.
 * @param {pg.Pool} pool
 * @returns {Promise<void>}
 */
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
    for (const name of SEED_INTERCEPTORS) {
      await client.query(
        "INSERT INTO interceptors (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [name]
      );
    }
  } finally {
    client.release();
  }
}
