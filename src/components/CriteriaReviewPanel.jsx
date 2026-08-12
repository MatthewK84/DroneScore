import { useCallback, useEffect, useState } from "react";
import { ApiError, getCurrentDay, getDayCriteria } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";

/**
 * Live criteria review. Shows the derived MOPs and the KPP compliance
 * verdicts for the current day exactly as they will print on the report.
 *
 * The value of seeing this before the day closes is that a KPP marked not
 * established is still fixable at the range. Once the report is generated
 * it is a finding.
 */

const STATUS_LABELS = Object.freeze({
  objective: "Objective",
  threshold: "Threshold",
  short: "Fell short",
  not_established: "No benchmark",
  not_measured: "Not measured",
  stated: "Stated",
});

const STATUS_COLORS = Object.freeze({
  objective: C.success,
  threshold: C.olive,
  short: C.miss,
  not_established: C.noAttempt,
  not_measured: C.inkMuted,
  stated: C.inkMuted,
});

/** @returns {string} A MOP value rendered for the screen. */
function formatValue(result) {
  const { value, units } = result;
  if (value === null || value === undefined) {
    return "No data";
  }
  if (typeof value === "object") {
    return `mean ${value.mean}${units} (${value.min} to ${value.max}, n=${value.n})`;
  }
  if (typeof value === "number") {
    return units === "" ? value.toFixed(2) : `${value} ${units}`;
  }
  return String(value);
}

export function CriteriaReviewPanel() {
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const current = await getCurrentDay();
      setReview(await getDayCriteria(current.day.id));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to build the review.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return <Loading label="Deriving measures..." />;
  }

  if (review === null) {
    return <Notice tone="error">{error || "The review is unavailable."}</Notice>;
  }

  return (
    <div>
      <SummaryStrip summary={review.summary} system={review.system} group={review.uasGroup} />
      {error ? <p style={st.error}>{error}</p> : null}
      {review.mops.map((group) => (
        <MopCard key={group.criterion} group={group} criteria={review.criteria} />
      ))}
      <ComplianceCard rows={review.compliance} />
    </div>
  );
}

/** The compliance counts at a glance. */
function SummaryStrip({ summary, system, group }) {
  const cells = [
    { label: "Objective", value: summary.objective, color: C.success },
    { label: "Threshold", value: summary.threshold, color: C.olive },
    { label: "Short", value: summary.short, color: C.miss },
    { label: "No bench", value: summary.not_established, color: C.noAttempt },
  ];
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Compliance Summary</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(78px, 1fr))", gap: 8 }}>
        {cells.map((cell) => (
          <div key={cell.label} style={{ textAlign: "center", padding: "8px 4px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <div style={st.stripLabel}>{cell.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: cell.color }}>{cell.value}</div>
          </div>
        ))}
      </div>
      <p style={{ ...st.meta, marginTop: 10 }}>
        System under test: {system.name || "none logged"}
        {group ? ` against Group ${group}` : ""}.
        {system.others.length > 0
          ? ` Runs were also logged for ${system.others.join(", ")}; those are not blended into this table.`
          : ""}
      </p>
    </div>
  );
}

/** One criterion's derived MOP results. */
function MopCard({ group, criteria }) {
  const meta = criteria.find((entry) => entry.id === group.criterion);
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>
        Criterion {group.criterion}: {meta ? meta.name : ""}
      </h2>
      {group.results.map((result) => (
        <div key={result.id} style={{ ...st.rowItem, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkMuted }}>MOP {result.id}</div>
            <div style={{ fontSize: 14, color: C.ink }}>{result.name}</div>
            <div style={{ ...st.meta, marginTop: 2, fontStyle: "italic" }}>{result.basis}</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.olive, textAlign: "right", maxWidth: 170 }}>
            {formatValue(result)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The KPP verdicts, with the ones needing action surfaced first. */
function ComplianceCard({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const actionable = rows.filter((row) => row.status === "short" || (row.status === "not_established" && row.measured !== null));
  const shown = showAll ? rows : actionable;
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>KPP Compliance</h2>
      <p style={{ ...st.meta, marginBottom: 10 }}>
        {showAll
          ? `All ${rows.length} catalog entries.`
          : `${actionable.length} entries need attention: measured but with no benchmark stored, or falling short of one.`}
      </p>
      <button style={{ ...st.ghostBtn, width: "100%", marginBottom: 12 }} onClick={() => setShowAll(!showAll)}>
        {showAll ? "Show only what needs attention" : `Show all ${rows.length} entries`}
      </button>
      {shown.length === 0 ? (
        <p style={st.meta}>Nothing needs attention on the entries measured so far.</p>
      ) : null}
      {shown.map((row) => (
        <div key={row.id} style={st.rowItem}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontFamily: MONO, fontSize: 13 }}>{row.label}</strong>
            <div style={{ ...st.meta, marginTop: 2 }}>
              {row.measure} ({row.units}) · {row.category}
            </div>
            <div style={{ ...st.meta, marginTop: 2 }}>
              Measured {row.detail || (row.measured === null ? "--" : row.measured)}
              {row.source ? ` from ${row.source}` : ""} · T {row.threshold ?? "--"} / O {row.objective ?? "--"}
            </div>
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              color: STATUS_COLORS[row.status] || C.inkMuted,
              whiteSpace: "nowrap",
            }}
          >
            {STATUS_LABELS[row.status] || row.status}
          </span>
        </div>
      ))}
    </div>
  );
}
