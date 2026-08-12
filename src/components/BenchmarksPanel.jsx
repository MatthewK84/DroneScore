import { useCallback, useEffect, useState } from "react";
import { ApiError, deriveBenchmarkDefaults, listBenchmarks, saveBenchmark } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";

/**
 * Threshold and Objective benchmarks.
 *
 * Section 4.2 requires these to be defined and documented before test
 * execution, and requires the final assessment to state whether the system
 * met the Threshold, fell short, or achieved the Objective.
 *
 * The derivation helper computes the range benchmarks that public UAS group
 * kinematics actually support, and shows the arithmetic for each one. It
 * refuses to produce probability of kill or simultaneous target counts,
 * because no public authoritative source establishes them and a fabricated
 * figure inside a formal evaluation is worse than an empty field.
 */

const EMPTY_INPUTS = Object.freeze({
  uasGroup: "1",
  standoffM: "500",
  cycleS: "30",
  launchToDefeatS: "10",
});

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
  const [inputs, setInputs] = useState(EMPTY_INPUTS);
  const [derived, setDerived] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  const setInput = useCallback((key, value) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const derive = useCallback(async () => {
    setError("");
    setStatus("");
    try {
      const data = await deriveBenchmarkDefaults({
        uasGroup: inputs.uasGroup,
        standoffM: Number(inputs.standoffM),
        cycleS: Number(inputs.cycleS),
        launchToDefeatS: Number(inputs.launchToDefeatS),
      });
      setDerived(data.derived);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to derive benchmarks.");
    }
  }, [inputs]);

  const accept = useCallback(
    async (entry) => {
      if (busy) {
        return;
      }
      setBusy(true);
      setError("");
      try {
        await saveBenchmark({
          kppId: entry.kppId,
          interceptorId: null,
          uasGroup: inputs.uasGroup,
          threshold: entry.threshold,
          objective: entry.objective,
          unit: entry.unit,
          basis: entry.basis,
        });
        setStatus(`Stored KPP ${entry.kppId} for Group ${inputs.uasGroup}.`);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to store the benchmark.");
      } finally {
        setBusy(false);
      }
    },
    [busy, inputs.uasGroup, reload]
  );

  if (loading) {
    return <Loading label="Loading benchmarks..." />;
  }

  return (
    <div>
      <Notice tone="warn">
        Section 4.2 requires Threshold and Objective values to be documented before test
        execution. Any KPP left without one prints as not established on the report, which
        is an open action against the evaluation rather than a pass.
      </Notice>

      {isAdmin ? (
        <DerivationCard
          inputs={inputs}
          groups={catalog.groups}
          onChange={setInput}
          onDerive={derive}
        />
      ) : null}

      {derived.length > 0 ? (
        <DerivedList entries={derived} onAccept={accept} busy={busy} isAdmin={isAdmin} />
      ) : null}

      <StoredList benchmarks={benchmarks} interceptors={interceptors} />

      {error ? <p style={st.error}>{error}</p> : null}
      {status ? <Notice tone="info">{status}</Notice> : null}
    </div>
  );
}

/** The inputs that a range derivation needs, plus the published group bands. */
function DerivationCard({ inputs, groups, onChange, onDerive }) {
  const band = groups.find((entry) => entry.group === inputs.uasGroup);
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Derive from UAS Group Kinematics</h2>
      <p style={{ ...st.meta, marginBottom: 12 }}>
        A target closing at a known ceiling speed covers a known distance in a known time.
        That arithmetic gives the range benchmarks. Effectiveness and quantity benchmarks are
        not derived here and must be entered with their own basis.
      </p>
      <label style={st.field}>
        <span style={st.label}>Target UAS group</span>
        <select style={st.input} value={inputs.uasGroup} onChange={(e) => onChange("uasGroup", e.target.value)}>
          {groups.map((entry) => (
            <option key={entry.group} value={entry.group}>
              Group {entry.group}
              {entry.maxSpeedKt === null ? " (no published ceiling)" : ` (to ${entry.maxSpeedKt} kt)`}
            </option>
          ))}
        </select>
      </label>
      {band ? (
        <p style={{ ...st.meta, marginTop: -6, marginBottom: 14 }}>
          Published band: to {band.maxWeightLb === null ? "unbounded" : `${band.maxWeightLb} lb`},
          {band.maxAltitudeFt === null ? " unbounded altitude" : ` ${band.maxAltitudeFt} ft ${band.altitudeRef}`},
          {band.maxSpeedKt === null ? " unbounded speed" : ` ${band.maxSpeedKt} kt`}.
        </p>
      ) : null}
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Protected standoff (m)</span>
          <input style={st.input} type="number" inputMode="decimal" value={inputs.standoffM} onChange={(e) => onChange("standoffM", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>Detect to defeat cycle (s)</span>
          <input style={st.input} type="number" inputMode="decimal" value={inputs.cycleS} onChange={(e) => onChange("cycleS", e.target.value)} />
        </label>
      </div>
      <label style={st.field}>
        <span style={st.label}>Launch to defeat (s)</span>
        <input style={st.input} type="number" inputMode="decimal" value={inputs.launchToDefeatS} onChange={(e) => onChange("launchToDefeatS", e.target.value)} />
      </label>
      <button style={{ ...st.priBtn, width: "100%" }} onClick={onDerive}>
        Derive benchmarks
      </button>
    </div>
  );
}

/** The derivation output, each row carrying the reasoning behind it. */
function DerivedList({ entries, onAccept, busy, isAdmin }) {
  const derivable = entries.filter((entry) => entry.derived);
  const withheld = entries.filter((entry) => !entry.derived);
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Derived ({derivable.length})</h2>
      {derivable.map((entry) => (
        <div key={entry.kppId} style={st.rowItem}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>KPP {entry.kppId}</strong>
            <div style={{ fontFamily: MONO, fontSize: 13, color: C.olive, marginTop: 2 }}>
              Threshold {entry.threshold} {entry.unit} / Objective {entry.objective} {entry.unit}
            </div>
            <div style={{ ...st.meta, marginTop: 4 }}>{entry.basis}</div>
          </div>
          {isAdmin ? (
            <button style={{ ...st.ghostBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => onAccept(entry)}>
              Accept
            </button>
          ) : null}
        </div>
      ))}
      <h2 style={{ ...st.secHead, marginTop: 18 }}>Not Derived ({withheld.length})</h2>
      <p style={{ ...st.meta, marginBottom: 10 }}>
        {withheld.map((entry) => `KPP ${entry.kppId}`).join(", ")}
      </p>
      <p style={st.meta}>{withheld.length > 0 ? withheld[0].basis : ""}</p>
    </div>
  );
}

/** The benchmarks already stored against the evaluation. */
function StoredList({ benchmarks, interceptors }) {
  if (benchmarks.length === 0) {
    return (
      <div style={st.card}>
        <h2 style={st.secHead}>Stored Benchmarks</h2>
        <p style={st.meta}>None stored yet. Every KPP will print as not established.</p>
      </div>
    );
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Stored Benchmarks ({benchmarks.length})</h2>
      {benchmarks.map((benchmark) => (
        <div key={benchmark.id} style={st.rowItem}>
          <div>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>KPP {benchmark.kppId}</strong>
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
