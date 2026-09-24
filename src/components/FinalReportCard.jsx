import { useEffect, useMemo, useState } from "react";
import { ApiError, listDays, openFinalReport } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";

/**
 * Final evaluation report. It consolidates every closed day in a date
 * range into one PDF, apart from the daily WORs. Runs pool across the
 * days, so each system is scored once on everything it flew. The report
 * is built on request from current data and is never stored.
 */

/** @returns {boolean} True when a day falls inside the optional range. */
function inRange(day, from, to) {
  return (from === "" || day.date >= from) && (to === "" || day.date <= to);
}

/** The closed days the report will include. */
function IncludedDays({ days }) {
  if (days.length === 0) {
    return <p style={st.meta}>No closed days fall in this range. Close a day on the Day tab to include it.</p>;
  }
  return (
    <div>
      {days.map((day) => (
        <div key={day.id} style={{ ...st.rowItem, padding: "8px 0" }}>
          <strong style={{ fontFamily: MONO, fontSize: 13 }}>{day.date}</strong>
          <span style={st.meta}>
            {day.engagementCount} runs | {day.worControlNumber || "No daily WOR"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Loads the recent days once. */
function useClosedDays() {
  const [state, setState] = useState({ days: [], loading: true, error: "" });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await listDays();
        const closed = data.days.filter((day) => day.status === "closed").sort((a, b) => a.date.localeCompare(b.date));
        if (!cancelled) {
          setState({ days: closed, loading: false, error: "" });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ days: [], loading: false, error: err instanceof ApiError ? err.message : "Failed to load days." });
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** One date bound of the range. */
function DateField({ label, value, onChange }) {
  return (
    <label style={{ ...st.field, minWidth: 0 }}>
      <span style={st.label}>{label}</span>
      <input style={{ ...st.input, minWidth: 0 }} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function FinalReportCard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { days, loading, error } = useClosedDays();
  const included = useMemo(() => days.filter((day) => inRange(day, from, to)), [days, from, to]);
  const reversed = from !== "" && to !== "" && from > to;

  if (loading) {
    return <Loading label="Loading days..." />;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Final Report</h2>
      <p style={{ ...st.meta, marginBottom: 12 }}>
        Consolidates every closed day in the range into one report. Each system is scored once on all the runs it
        flew. The report lists each daily WOR by control number and uses the benchmarks stored now. Leave both dates
        blank to include every closed day.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div style={st.grid2}>
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </div>
      {reversed ? <p style={st.error}>The start date must not be after the end date.</p> : null}
      <span style={st.label}>Included ({included.length})</span>
      <IncludedDays days={reversed ? [] : included} />
      <button
        style={{ ...st.priBtn, width: "100%", marginTop: 14, opacity: included.length === 0 || reversed ? 0.6 : 1 }}
        disabled={included.length === 0 || reversed}
        onClick={() => openFinalReport(from, to)}
      >
        Open final report
      </button>
      <p style={{ ...st.meta, marginTop: 8, color: C.inkMuted }}>The list shows the 60 most recent days. The report includes every closed day in the range.</p>
    </div>
  );
}
