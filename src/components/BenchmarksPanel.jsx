import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, listBenchmarks, saveBenchmark } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { TimelinePresetsPanel } from "./TimelinePresetsPanel.jsx";
import { Loading, Notice } from "./ui.jsx";

/**
 * Threshold and Objective benchmarks.
 *
 * Section 4.2 requires these to be defined and documented before test
 * execution, and requires the final assessment to state whether the system
 * met the Threshold, fell short, or achieved the Objective.
 *
 * Presets come from the C4 ETA timeline budget. The group-ceiling
 * derivation is no longer offered here: every row it derives is on the Not
 * Repeatably Assessable list. Its server route and tests remain.
 */

/** A blank manual benchmark entry. */
const EMPTY_MANUAL = Object.freeze({
  rowId: "",
  uasGroup: "",
  threshold: "",
  objective: "",
  unit: "",
  basis: "",
  critical: false,
});

/**
 * Every row a Threshold and Objective can be stored against: the scorecard
 * rows of the five Core Capability Areas first, in criteria order, then the
 * catalog entries that only appear in the supporting groups.
 *
 * @param {object} catalog Criteria catalog response.
 * @returns {{ id: string, label: string, units: string }[]}
 */
function benchmarkableRows(catalog) {
  const seen = new Set();
  const options = [];
  for (const area of catalog.areas || []) {
    for (const section of area.sections) {
      for (const row of section.rows) {
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        const label = row.kind === "INT" ? row.id : `${row.kind} ${row.id}`;
        options.push({ id: row.id, label: `${label} - ${row.measure}`, units: row.units });
      }
    }
  }
  for (const entry of catalog.catalog || []) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    options.push({ id: entry.id, label: `${entry.label} - ${entry.measure}`, units: entry.units });
  }
  return options;
}

/** @returns {string} A short label for the benchmark scope columns. */
function scopeLabel(benchmark, interceptors) {
  const system = interceptors.find((entry) => entry.id === benchmark.interceptorId);
  const systemText = system ? system.name : "All systems";
  const groupText = benchmark.uasGroup ? `Group ${benchmark.uasGroup}` : "All groups";
  return `${systemText} / ${groupText}`;
}

/** @param {{ catalog: object, interceptors: object[], isAdmin: boolean }} props */
export function BenchmarksPanel({ catalog, interceptors, isAdmin }) {
  const [benchmarks, setBenchmarks] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await listBenchmarks();
      setBenchmarks(data.benchmarks);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load benchmarks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return <Loading label="Loading benchmarks..." />;
  }

  return (
    <div>
      <Notice tone="warn">
        Section 4.2 requires Threshold and Objective values to be documented before test
        execution. Any assessed KPP left without one prints as Not Assessed on the report, which
        is an open action against the evaluation rather than a pass.
      </Notice>

      <TimelinePresetsPanel interceptors={interceptors} benchmarks={benchmarks} isAdmin={isAdmin} onWritten={reload} />

      {isAdmin ? <ManualCard catalog={catalog} onSaved={reload} onError={setError} onStatus={setStatus} /> : null}

      <StoredList benchmarks={benchmarks} interceptors={interceptors} notAssessableIds={catalog.notAssessableIds || []} />

      {error ? <p style={st.error}>{error}</p> : null}
      {status ? <Notice tone="info">{status}</Notice> : null}
    </div>
  );
}

/**
 * Manual entry for the Threshold, Objective, and Critical mark on any
 * scorecard row. The criteria require both limits to be documented before
 * test execution, and they flag a system "Not Militarily Effective" when a
 * Critical KPP scores 0 without saying which KPPs are critical. That call
 * belongs to the evaluator, so it is made here, beside the limits, and is
 * never inferred from the measure's name.
 */
function ManualCard({ catalog, onSaved, onError, onStatus }) {
  const [entry, setEntry] = useState(EMPTY_MANUAL);
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => benchmarkableRows(catalog), [catalog]);

  const setField = useCallback((key, value) => {
    setEntry((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (entry.rowId === "" || saving) {
      return;
    }
    setSaving(true);
    onError("");
    try {
      await saveBenchmark({
        kppId: entry.rowId,
        interceptorId: null,
        uasGroup: entry.uasGroup,
        threshold: entry.threshold === "" ? null : Number(entry.threshold),
        objective: entry.objective === "" ? null : Number(entry.objective),
        unit: entry.unit,
        basis: entry.basis,
        critical: entry.critical,
      });
      onStatus(`Stored ${entry.rowId}.`);
      setEntry(EMPTY_MANUAL);
      await onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to store the benchmark.");
    } finally {
      setSaving(false);
    }
  }, [entry, saving, onSaved, onError, onStatus]);

  const selected = options.find((option) => option.id === entry.rowId) || null;
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Set a Benchmark</h2>
      <p style={{ ...st.meta, marginBottom: 12 }}>
        Any row of the scorecard, including the interceptor-specific metrics and the
        supporting groups. A row with neither limit stored is reported as having no
        benchmark and stays out of the score.
      </p>
      <label style={st.field}>
        <span style={st.label}>Row</span>
        <select style={st.input} value={entry.rowId} onChange={(e) => setField("rowId", e.target.value)}>
          <option value="">Select a row</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Threshold</span>
          <input style={st.input} type="number" inputMode="decimal" value={entry.threshold} onChange={(e) => setField("threshold", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>Objective</span>
          <input style={st.input} type="number" inputMode="decimal" value={entry.objective} onChange={(e) => setField("objective", e.target.value)} />
        </label>
      </div>
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Unit</span>
          <input style={st.input} value={entry.unit} placeholder={selected ? selected.units : ""} onChange={(e) => setField("unit", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>UAS group (blank for all)</span>
          <input style={st.input} value={entry.uasGroup} placeholder="1" onChange={(e) => setField("uasGroup", e.target.value)} />
        </label>
      </div>
      <label style={st.field}>
        <span style={st.label}>Basis</span>
        <textarea
          style={{ ...st.input, minHeight: 72, resize: "vertical", paddingTop: 10 }}
          value={entry.basis}
          placeholder="Where these numbers come from. This prints on the report."
          onChange={(e) => setField("basis", e.target.value)}
        />
      </label>
      <button
        onClick={() => setField("critical", !entry.critical)}
        style={{
          ...st.outcomeBtn,
          width: "100%",
          minHeight: 46,
          marginBottom: 12,
          borderColor: entry.critical ? C.orange : C.line,
          color: entry.critical ? C.orange : C.inkMuted,
          background: entry.critical ? `${C.orange}12` : C.panel,
        }}
      >
        {entry.critical ? "Critical KPP" : "Not a Critical KPP"}
      </button>
      <p style={{ ...st.meta, marginTop: -6, marginBottom: 12 }}>
        A Critical KPP scoring 0 flags the whole system Not Militarily Effective.
      </p>
      <button
        style={{ ...st.priBtn, width: "100%", opacity: saving || entry.rowId === "" ? 0.6 : 1 }}
        disabled={saving || entry.rowId === ""}
        onClick={submit}
      >
        Store benchmark
      </button>
    </div>
  );
}

/**
 * The benchmarks already stored against the evaluation. A benchmark on a
 * row that is not assessed stays stored, so moving the row back restores
 * it, but it is tagged because nothing reads it now.
 */
function StoredList({ benchmarks, interceptors, notAssessableIds }) {
  if (benchmarks.length === 0) {
    return (
      <div style={st.card}>
        <h2 style={st.secHead}>Stored Benchmarks</h2>
        <p style={st.meta}>None stored yet. Every KPP will print as Not Assessed.</p>
      </div>
    );
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Stored Benchmarks ({benchmarks.length})</h2>
      {benchmarks.map((benchmark) => (
        <div key={benchmark.id} style={st.rowItem}>
          <div>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{benchmark.kppId}</strong>
            {benchmark.critical ? (
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.orange, marginLeft: 8, letterSpacing: "0.06em" }}>
                CRITICAL
              </span>
            ) : null}
            {notAssessableIds.includes(benchmark.kppId) ? (
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.inkMuted, marginLeft: 8, letterSpacing: "0.06em" }}>
                NOT REPEATABLY ASSESSABLE, UNUSED
              </span>
            ) : null}
            <div style={{ ...st.meta, marginTop: 2 }}>{scopeLabel(benchmark, interceptors)}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.olive, marginTop: 2 }}>
              T {benchmark.threshold ?? "--"} / O {benchmark.objective ?? "--"} {benchmark.unit}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
