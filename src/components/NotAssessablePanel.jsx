import { C, MONO, st } from "../styles.js";
import { Notice } from "./ui.jsx";

/**
 * The criteria this evaluation does not assess, grouped by reason, with
 * the reason for every row. The list lives on the server in
 * not-assessable.js and arrives with the criteria catalog, so this view,
 * the scorecard, and both reports always agree.
 */

/** One row that is not assessed. */
function ReasonRow({ row }) {
  return (
    <div style={{ ...st.rowItem, flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontFamily: MONO, fontSize: 13 }}>{row.label}</strong>
        <span style={{ fontSize: 14, color: C.ink }}>{row.measure}</span>
      </div>
      <p style={{ ...st.meta, margin: 0 }}>{row.why}</p>
    </div>
  );
}

/** One reason and every row it covers. */
function ReasonGroup({ group }) {
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>
        {group.title} ({group.rows.length})
      </h2>
      <p style={{ ...st.meta, marginBottom: 8 }}>{group.summary}</p>
      {group.rows.map((row) => (
        <ReasonRow key={row.id} row={row} />
      ))}
    </div>
  );
}

/** @param {{ groups: object[] }} props The catalog's notAssessable list. */
export function NotAssessablePanel({ groups }) {
  const shown = (groups || []).filter((group) => group.rows.length > 0);
  const count = shown.reduce((sum, group) => sum + group.rows.length, 0);
  return (
    <div>
      <Notice tone="info">
        The evaluation does not assess these {count} criteria. A range scorer cannot measure them repeatably
        against a clear definition. They are left out of every score, count, and report table. Section 12 of each
        report lists them with these reasons.
      </Notice>
      {shown.map((group) => (
        <ReasonGroup key={group.key} group={group} />
      ))}
    </div>
  );
}
