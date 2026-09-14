import { useCallback, useEffect, useState } from "react";
import { ApiError, getCriteriaCatalog, listInterceptors } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";
import { SystemProfilePanel } from "./SystemProfilePanel.jsx";
import { BenchmarksPanel } from "./BenchmarksPanel.jsx";
import { TestMatrixPanel } from "./TestMatrixPanel.jsx";
import { C4ScorecardPanel } from "./C4ScorecardPanel.jsx";

/**
 * Criteria tab, laid out as the consolidated C4 criteria document.
 *
 * The Scorecard is the document itself: the five Core Capability Areas,
 * every row they print, the supporting groups, and the engagement
 * timeline, all scored live. It opens first because it is what the
 * evaluation is, and because it fills itself from the runs the Score tab
 * has already logged.
 *
 * The other three views hold what the criteria say is decided outside a
 * run: the system profile declarations, the Threshold and Objective
 * benchmarks that must be documented before test execution, and the test
 * matrix. A row whose benchmark is missing is visible on the Scorecard as
 * an action to take now, not as a surprise on the report.
 */

const VIEWS = Object.freeze([
  { key: "scorecard", label: "Scorecard" },
  { key: "profile", label: "System Profile" },
  { key: "benchmarks", label: "Benchmarks" },
  { key: "matrix", label: "Test Matrix" },
]);

/** @param {{ isAdmin: boolean }} props */
export function CriteriaTab({ isAdmin }) {
  const [view, setView] = useState("scorecard");
  const [catalog, setCatalog] = useState(null);
  const [interceptors, setInterceptors] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [catalogData, interceptorData] = await Promise.all([
        getCriteriaCatalog(),
        listInterceptors(),
      ]);
      setCatalog(catalogData);
      setInterceptors(interceptorData.interceptors);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the criteria framework.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return <Loading label="Loading criteria framework..." />;
  }

  if (catalog === null) {
    return <Notice tone="error">{error || "The criteria framework is unavailable."}</Notice>;
  }

  return (
    <div>
      <ViewBar view={view} onSelect={setView} />
      {error ? <p style={st.error}>{error}</p> : null}
      <CriteriaView view={view} catalog={catalog} interceptors={interceptors} isAdmin={isAdmin} />
    </div>
  );
}

/** @returns {JSX.Element} The panel for the selected view. */
function CriteriaView({ view, catalog, interceptors, isAdmin }) {
  if (view === "profile") {
    return <SystemProfilePanel catalog={catalog} interceptors={interceptors} isAdmin={isAdmin} />;
  }
  if (view === "benchmarks") {
    return <BenchmarksPanel catalog={catalog} interceptors={interceptors} isAdmin={isAdmin} />;
  }
  if (view === "matrix") {
    return <TestMatrixPanel isAdmin={isAdmin} />;
  }
  return <C4ScorecardPanel isAdmin={isAdmin} interceptors={interceptors} />;
}

/** The secondary selector inside the tab. Scrolls sideways on a phone. */
function ViewBar({ view, onSelect }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        marginBottom: 16,
        paddingBottom: 4,
      }}
    >
      {VIEWS.map((entry) => {
        const active = view === entry.key;
        return (
          <button
            key={entry.key}
            onClick={() => onSelect(entry.key)}
            style={{
              ...st.ghostBtn,
              flex: "0 0 auto",
              fontFamily: MONO,
              fontSize: 12,
              letterSpacing: 0,
              textTransform: "none",
              borderColor: active ? C.olive : C.line,
              color: active ? C.olive : C.inkMuted,
              background: active ? C.oliveSoft : "transparent",
            }}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
