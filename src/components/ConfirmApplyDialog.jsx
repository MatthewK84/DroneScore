import { C, MONO, st } from "../styles.js";
import { formatStoredValue, stripStamp } from "../preset-logic.js";

/**
 * Confirms a write before it happens. It lists every row the write will
 * store, and shows current and new values side by side for any row that
 * would overwrite a different stored benchmark.
 */

const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(26, 32, 24, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const PANEL = { ...st.card, width: "100%", maxWidth: 720, maxHeight: "85vh", overflowY: "auto", marginBottom: 0 };

/** @returns {string} One level pair as text. */
function pairText(values) {
  return `T ${formatStoredValue(values.threshold, values.unit)} / O ${formatStoredValue(values.objective, values.unit)}`;
}

/** One row of the confirmation table. */
function ConfirmRow({ item, conflict }) {
  return (
    <tr>
      <td style={st.tdMono}>{item.kppId}</td>
      <td style={{ ...st.tdMono, color: conflict ? C.noAttempt : C.inkMuted }}>{conflict ? pairText(conflict.current) : "Not stored"}</td>
      <td style={{ ...st.tdMono, color: C.olive }}>{pairText(item)}</td>
      <td style={{ ...st.td, fontSize: 11 }}>{conflict && stripStamp(conflict.current.basis) !== stripStamp(item.basis) ? "Basis text changes" : ""}</td>
    </tr>
  );
}

/** @returns {string} The heading for the dialog kind. */
function titleFor(dialog) {
  if (dialog.kind === "judgment") {
    return `Adopt ${dialog.items.length} judgment presets`;
  }
  return `Overwrite ${dialog.conflicts.length} stored benchmarks`;
}

/**
 * @param {{ dialog: { kind: string, items: object[], conflicts: object[] }, busy: boolean,
 *   onConfirm: () => void, onCancel: () => void }} props
 */
export function ConfirmApplyDialog({ dialog, busy, onConfirm, onCancel }) {
  const byId = new Map(dialog.conflicts.map((conflict) => [conflict.kppId, conflict]));
  const rows = dialog.kind === "judgment" ? dialog.items : dialog.items.filter((item) => byId.has(item.kppId));
  return (
    <div style={OVERLAY} role="dialog" aria-modal="true" aria-label={titleFor(dialog)}>
      <div style={PANEL}>
        <h2 style={st.secHead}>{titleFor(dialog)}</h2>
        {dialog.kind === "judgment" ? (
          <p style={{ ...st.meta, marginBottom: 10 }}>
            These are analyst recommendations, not values from an authoritative source. Each stored basis records the
            admin role and today&apos;s date.
          </p>
        ) : null}
        <p style={{ ...st.meta, marginBottom: 10, fontFamily: MONO }}>
          {dialog.conflicts.length} of {dialog.items.length} rows replace a different stored benchmark.
        </p>
        <div style={st.tableWrap}>
          <table style={{ ...st.table, minWidth: 0 }}>
            <thead>
              <tr>
                <th style={st.th}>Row</th>
                <th style={st.th}>Current</th>
                <th style={st.th}>New</th>
                <th style={st.th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <ConfirmRow key={item.kppId} item={item} conflict={byId.get(item.kppId) || null} />
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button style={{ ...st.priBtn, flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={onConfirm}>
            Confirm and store
          </button>
          <button style={{ ...st.ghostBtn, flex: 1 }} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
