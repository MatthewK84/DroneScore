import { useCallback, useEffect, useState } from "react";
import { ApiError, getCriteriaCatalog, listInterceptors } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";
import { SystemProfilePanel } from "./SystemProfilePanel.jsx";
import { BenchmarksPanel } from "./BenchmarksPanel.jsx";
import { TestMatrixPanel } from "./TestMatrixPanel.jsx";
import { CriteriaReviewPanel } from "./CriteriaReviewPanel.jsx";

/**
 * Criteria tab. Holds the three things the C-sUAS Capability
 * Characterization Criteria require that are not captured run by run:
 * the system profile answers for sections 4.2.6 through 4.2.8, the
 * Threshold and Objective benchmarks that section 4.2 requires to be
 * documented before test execution, and the test matrix.
 *
 * The fourth view is the review, which shows the derived MOPs and the
 * compliance verdicts exactly as they will print on the report. Seeing
 * them before the day closes is the point: a KPP marked not established
 * is an action to take now, not a surprise on the PDF.
 */

const VIEWS = Object.freeze([
  { key: "review", label: "Review" },
  { key: "profile", label: "System Profile" },
  { key: "benchmarks", label: "Benchmarks" },
  { key: "matrix", label: "Test Matrix" },
]);

/** @param {{ isAdmin: boolean }} props */
export function CriteriaTab({ isAdmin }) {
  const [view, setView] = useState("review");
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
  return <CriteriaReviewPanel />;
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
