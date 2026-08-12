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

  // Capability Characterization Criteria, section 4. Every column below is
  // additive and nullable. A null stage_reached is deliberate: it means the
  // run predates stage capture or the scorer used the fast path, and the
  // derivation infers a stage from the outcome and labels the result as
  // inferred. Defaulting to a stage instead would present a guess as a
  // measurement, which is the one thing a formal evaluation cannot absorb.
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS stage_reached TEXT`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS detect_range_m NUMERIC`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS detect_alt_m NUMERIC`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS track_continuity_pct NUMERIC`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS track_error_m NUMERIC`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS id_range_m NUMERIC`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS id_time_s NUMERIC`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS identified_ok BOOLEAN`,
  `ALTER TABLE engagements ADD COLUMN IF NOT EXISTS test_profile_id BIGINT`,

  // Operational-day counters. These feed MOP 1.1.4 false alarm rate,
  // MOP 4.2.1 mean time between system abort, MOP 4.2.2 mean time to
  // repair, and KPP 6.1 and 6.3 workload.
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS false_alarms INTEGER`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS operating_minutes NUMERIC`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS system_aborts INTEGER`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS repair_minutes NUMERIC`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS operate_crew INTEGER`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS setup_crew INTEGER`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS setup_minutes NUMERIC`,
  `ALTER TABLE days ADD COLUMN IF NOT EXISTS sensor_source TEXT NOT NULL DEFAULT ''`,

  // System profile answers for sections 4.2.6 through 4.2.8 and the
  // qualitative MOPs of Criteria 4 and 5, keyed by catalog id. JSONB rather
  // than a column per KPP: the catalog runs to roughly seventy entries and
  // the framework will revise, so keys absorb revisions without migrations.
  `ALTER TABLE interceptors ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb`,

  // Section 4.2 requires Threshold and Objective to be documented before
  // test execution. interceptor_id NULL means the benchmark applies to every
  // system under test; uas_group '' means it applies to every target group.
  `CREATE TABLE IF NOT EXISTS benchmarks (
    id BIGSERIAL PRIMARY KEY,
    interceptor_id BIGINT REFERENCES interceptors(id) ON DELETE CASCADE,
    kpp_id TEXT NOT NULL,
    uas_group TEXT NOT NULL DEFAULT '',
    threshold NUMERIC,
    objective NUMERIC,
    unit TEXT NOT NULL DEFAULT '',
    basis TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmarks_key
     ON benchmarks (COALESCE(interceptor_id, 0), kpp_id, uas_group)`,

  // Test matrix. A profile is one row block of the matrix: a mission type
  // flown at a time of day for a required number of data points. Its targets
  // are the platform lines under it, each with its own altitude, speed, and
  // launch point, so a multi-target profile stays one profile.
  `CREATE TABLE IF NOT EXISTS test_profiles (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    mission TEXT NOT NULL DEFAULT '',
    time_of_day TEXT NOT NULL DEFAULT 'Day',
    data_points_required INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS test_profile_targets (
    id BIGSERIAL PRIMARY KEY,
    profile_id BIGINT NOT NULL REFERENCES test_profiles(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL DEFAULT 1,
    target_name TEXT NOT NULL,
    drone_id BIGINT REFERENCES drones(id) ON DELETE SET NULL,
    elevation_ft_agl NUMERIC,
    speed_mph NUMERIC,
    launch_point TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_profile_targets ON test_profile_targets(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_engagements_profile ON engagements(test_profile_id)`,
  `ALTER TABLE engagements DROP CONSTRAINT IF EXISTS engagements_test_profile_fk`,
  `ALTER TABLE engagements ADD CONSTRAINT engagements_test_profile_fk
     FOREIGN KEY (test_profile_id) REFERENCES test_profiles(id) ON DELETE SET NULL`,
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
