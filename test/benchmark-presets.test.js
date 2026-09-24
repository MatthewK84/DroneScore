import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { parseBulkRequest, planBulkWrite, presetStamp, stripStamp } from "../server/benchmark-presets.js";
import { createBenchmarkPresetsRouter } from "../server/routes/benchmark-presets.js";
import { parseBenchmark } from "../server/routes/criteria.js";
import { isNotAssessable } from "../server/not-assessable.js";
import { NON_KINETIC_DEFAULT, TIMELINE_PRESETS } from "../server/timeline-presets.js";
import { C4_ETA_60_180 } from "../server/timeline-profile.js";

const ACTOR = Object.freeze({ role: "admin", isoDate: "2026-09-24" });

/**
 * An in-memory stand-in for the pg pool. It answers the two statements the
 * bulk route issues, applies upserts the way the unique index would, and
 * logs every statement so a test can see BEGIN, ROLLBACK, and COMMIT.
 */
function fakePool(seed = []) {
  const state = { rows: seed.map((row) => ({ ...row })), log: [] };
  const sameKey = (row, params) =>
    (row.interceptor_id ?? 0) === (params[0] ?? 0) && row.kpp_id === params[1] && row.uas_group === params[2];
  const upsert = (params) => {
    const values = { threshold: params[3], objective: params[4], unit: params[5], basis: params[6] };
    const existing = state.rows.find((row) => sameKey(row, params));
    if (existing) {
      Object.assign(existing, values);
      return;
    }
    state.rows.push({ id: state.rows.length + 1, interceptor_id: params[0], kpp_id: params[1], uas_group: params[2], critical: false, ...values });
  };
  const client = {
    query: async (sql, params) => {
      const verb = sql.trim().split(/\s+/)[0];
      state.log.push(verb);
      if (verb === "INSERT") {
        upsert(params);
      }
      return { rows: verb === "SELECT" ? state.rows.map((row) => ({ ...row })) : [] };
    },
    release: () => {},
  };
  return { pool: { connect: async () => client }, state };
}

/** @returns {Promise<{ url: string, close: () => Promise<void> }>} A test server. */
function serve(pool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.get("x-test-role");
    req.session = role ? { role } : null;
    next();
  });
  app.use("/api", createBenchmarkPresetsRouter(pool, { timezone: "UTC" }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const url = `http://127.0.0.1:${server.address().port}/api`;
      resolve({ url, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

/** @returns {Promise<{ status: number, body: object }>} */
async function call(url, method, role, body) {
  const headers = { "Content-Type": "application/json", "x-test-role": role };
  const response = await fetch(url, { method, headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

/** @returns {object} A derive-timeline body at the C4 defaults. */
function deriveBody(overrides = {}) {
  return { params: { ...C4_ETA_60_180, ...overrides }, payloadTypes: [...NON_KINETIC_DEFAULT] };
}

/** @returns {object} A stored row as pg returns it. */
function storedRow(kppId, threshold, objective, extra = {}) {
  return { id: 1, interceptor_id: null, kpp_id: kppId, uas_group: "", threshold: String(threshold), objective: String(objective), unit: "km", basis: "manual", critical: false, ...extra };
}

let server;
let fake;

before(async () => {
  fake = fakePool();
  server = await serve(fake.pool);
});

after(async () => {
  await server.close();
});

test("derive-timeline returns every assessed preset row with its milestones", async () => {
  const { status, body } = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "scorer", deriveBody());
  const assessed = TIMELINE_PRESETS.filter((entry) => !isNotAssessable(entry.id));
  assert.equal(status, 200);
  assert.equal(body.rows.length, assessed.length);
  assert.ok(!body.rows.some((row) => isNotAssessable(row.id)), "no row the evaluation does not assess");
  assert.equal(body.milestones.length, 14);
});

test("8.4 previews and stores in minutes, the unit MOP 4.2.1 reports", async () => {
  const { body } = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "scorer", deriveBody());
  const row = body.rows.find((entry) => entry.id === "8.4");
  assert.deepEqual([row.threshold, row.objective, row.units], [6480, 28080, "min"]);
  assert.deepEqual([row.store.threshold, row.store.objective, row.store.unit], [6480, 28080, "min"]);
});

test("Y/N presets store 1 for required, and uncovered rows store nothing", async () => {
  const { body } = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "scorer", deriveBody());
  const row = body.rows.find((entry) => entry.id === "7.5");
  assert.deepEqual([row.store.threshold, row.store.objective, row.store.unit], [1, 1, "Y/N"]);
  assert.equal(body.rows.find((entry) => entry.id === "10.1").store, null);
});

test("phase budgets that miss the timeline are rejected with the reason", async () => {
  const phases = { ...C4_ETA_60_180.threshold.phases, decide: 1 };
  const bad = deriveBody({ threshold: { ...C4_ETA_60_180.threshold, phases } });
  const { status, body } = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "admin", bad);
  assert.equal(status, 400);
  assert.match(body.errors.join(" "), /threshold phases sum to 136 s/);
});

test("an unknown payload type is rejected", async () => {
  const bad = { ...deriveBody(), payloadTypes: ["ew_takeover", "railgun"] };
  const { status, body } = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "admin", bad);
  assert.equal(status, 400);
  assert.match(body.error, /Unknown payload type: railgun/);
});

test("missing parameters are all reported at once", async () => {
  const { status, body } = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "admin", { payloadTypes: [] });
  assert.equal(status, 400);
  assert.ok(body.errors.length >= 8);
  assert.match(body.error, /standoffM must be a positive number/);
});

test("viewers cannot preview and scorers cannot write", async () => {
  const preview = await call(`${server.url}/criteria/benchmarks/derive-timeline`, "POST", "viewer", deriveBody());
  const write = await call(`${server.url}/criteria/benchmarks/bulk`, "PUT", "scorer", { items: [{ kppId: "1.1" }] });
  assert.equal(preview.status, 403);
  assert.equal(write.status, 403);
});

test("one bad item rejects the whole bulk request before the database", async () => {
  const logLength = fake.state.log.length;
  const items = [
    { kppId: "1.1", threshold: 3.41, objective: 4.35, unit: "km", basis: "ok" },
    { kppId: "9.5", threshold: 1, objective: 2, unit: "$", basis: "not covered" },
  ];
  const { status, body } = await call(`${server.url}/criteria/benchmarks/bulk`, "PUT", "admin", { items });
  assert.equal(status, 400);
  assert.match(body.error, /9.5 is not covered/);
  assert.equal(fake.state.log.length, logLength);
});

test("a changed stored row returns 409 and writes nothing without confirmation", async () => {
  const local = fakePool([storedRow("1.1", 3, 4)]);
  const localServer = await serve(local.pool);
  const items = [{ kppId: "1.1", threshold: 3.41, objective: 4.35, unit: "km", basis: "preset" }, { kppId: "2.1", threshold: 3.21, objective: 4.07, unit: "km", basis: "preset" }];
  const { status, body } = await call(`${localServer.url}/criteria/benchmarks/bulk`, "PUT", "admin", { items });
  await localServer.close();
  assert.equal(status, 409);
  assert.deepEqual(body.conflicts.map((entry) => entry.kppId), ["1.1"]);
  assert.deepEqual(body.conflicts[0].current.threshold, 3);
  assert.ok(!local.state.log.includes("INSERT"));
  assert.ok(local.state.log.includes("ROLLBACK"));
  assert.equal(local.state.rows.length, 1);
});

test("a confirmed overwrite writes every row and keeps the Critical mark", async () => {
  const local = fakePool([storedRow("1.1", 3, 4, { critical: true })]);
  const localServer = await serve(local.pool);
  const items = [{ kppId: "1.1", threshold: 3.41, objective: 4.35, unit: "km", basis: "preset" }, { kppId: "2.1", threshold: 3.21, objective: 4.07, unit: "km", basis: "preset" }];
  const { status, body } = await call(`${localServer.url}/criteria/benchmarks/bulk`, "PUT", "admin", { items, confirmOverwrite: true });
  await localServer.close();
  assert.equal(status, 200);
  assert.equal(body.written, 2);
  assert.ok(local.state.log.includes("COMMIT"));
  const overwritten = body.benchmarks.find((entry) => entry.kppId === "1.1");
  assert.deepEqual([overwritten.threshold, overwritten.critical], [3.41, true]);
});

test("replaying a request leaves the same state and keeps the first stamp", async () => {
  const local = fakePool();
  const localServer = await serve(local.pool);
  const items = [{ kppId: "5.4", threshold: 80, objective: 90, unit: "%", basis: "judgment basis" }];
  const first = await call(`${localServer.url}/criteria/benchmarks/bulk`, "PUT", "admin", { items });
  const snapshot = JSON.stringify(local.state.rows);
  const replay = await call(`${localServer.url}/criteria/benchmarks/bulk`, "PUT", "admin", { items });
  await localServer.close();
  assert.deepEqual([first.body.written, replay.body.written, replay.body.unchanged], [1, 0, 1]);
  assert.equal(JSON.stringify(local.state.rows), snapshot);
});

test("a judgment stamp names the adopting role and date; a derived stamp names no one", () => {
  const parsed = parseBulkRequest(
    { items: [{ kppId: "5.4", threshold: 80, objective: 90, unit: "%", basis: "Pk basis" }, { kppId: "1.1", threshold: 3.41, objective: 4.35, unit: "km", basis: "Range basis" }] },
    parseBenchmark,
    ACTOR
  );
  assert.equal(parsed.ok, true);
  const [judgment, derived] = parsed.request.items;
  assert.equal(judgment.basis, "[C4 ETA 60/180 preset: judgment, adopted by admin on 2026-09-24] Pk basis");
  assert.equal(derived.basis, "[C4 ETA 60/180 preset: derived] Range basis");
  assert.doesNotMatch(derived.basis, /adopted by/);
});

test("a stamped basis is never stamped twice", () => {
  const stamp = presetStamp("derived", "admin", "2026-09-24");
  const parsed = parseBulkRequest({ items: [{ kppId: "1.1", threshold: 3, objective: 4, unit: "km", basis: `${stamp} Range` }] }, parseBenchmark, ACTOR);
  assert.equal(parsed.request.items[0].basis, `${stamp} Range`);
  assert.equal(stripStamp(parsed.request.items[0].basis), "Range");
});

test("the plan ignores the stamp when comparing a stored row", () => {
  const stored = [storedRow("1.1", 3.41, 4.35, { basis: "[C4 ETA 60/180 preset: derived] Range" })];
  const item = { kppId: "1.1", threshold: 3.41, objective: 4.35, unit: "km", basis: "[C4 ETA 60/180 preset: derived] Range" };
  assert.deepEqual(planBulkWrite(stored, [item]), { writes: [], conflicts: [], unchanged: ["1.1"] });
});

test("bulk requests over the cap, with duplicates, or with a bad system id are rejected", () => {
  const many = Array.from({ length: 151 }, () => ({ kppId: "1.1" }));
  assert.match(parseBulkRequest({ items: many }, parseBenchmark, ACTOR).errors[0], /at most 150/);
  const twice = [{ kppId: "1.1" }, { kppId: "1.1" }];
  assert.match(parseBulkRequest({ items: twice }, parseBenchmark, ACTOR).errors[0], /only once/);
  const scoped = { interceptorId: "abc", items: [{ kppId: "1.1", threshold: 1, objective: 2 }] };
  assert.match(parseBulkRequest(scoped, parseBenchmark, ACTOR).errors[0], /interceptorId/);
});
