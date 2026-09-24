import { useState } from "react";
import { C, MONO, pillStyle, st } from "../styles.js";
import {
  buildItem,
  findStored,
  formatPresetValue,
  formatStoredValue,
  groupBySection,
  isWritable,
  rowStatus,
  writableBySource,
} from "../preset-logic.js";

/**
 * The resolved preset rows, grouped by section in resolver order. Each row
 * applies with one click. Bulk actions never mix sources: the derived
 * actions skip judgment rows, and judgment rows have their own action.
 */

const SOURCE_BADGES = Object.freeze({
  derived: { label: "Derived", color: C.olive },
  judgment: { label: "Judgment", color: C.orange },
  requirement: { label: "Requirement", color: C.inkMuted },
  not_covered: { label: "Not covered", color: C.inkMuted },
});

const STATUS_PILLS = Object.freeze({
  not_stored: { label: "Not stored", color: C.inkMuted },
  matches: { label: "Matches stored", color: C.success },
  differs: { label: "Differs from stored", color: C.noAttempt },
  na: { label: "N/A", color: C.inkMuted },
  not_covered: { label: "Read only", color: C.inkMuted },
  unpopulated: { label: "Not populated", color: C.inkMuted },
});

const DIRECTIONS = Object.freeze({
  higher: "↑ higher is better",
  lower: "↓ lower is better",
  yes: "favorable answer: Yes",
  no: "favorable answer: No",
});

const SMALL_BTN = { ...st.ghostBtn, minHeight: 40, padding: "6px 12px", fontSize: 13 };

/** @returns {object} Items that write every row at both levels. */
function itemsFor(rows) {
  return rows.map((row) => buildItem(row, "both", null));
}

/** The apply buttons for one row. */
function RowButtons({ row, stored, busy, onApply }) {
  const apply = (mode) => onApply([buildItem(row, mode, stored)]);
  const style = { ...SMALL_BTN, opacity: busy ? 0.6 : 1 };
  if (row.source === "requirement") {
    return (
      <button style={style} disabled={busy} onClick={() => apply("both")}>
        Apply requirement
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button style={style} disabled={busy} onClick={() => apply("both")}>
        Apply T+O
      </button>
      <button style={style} disabled={busy} onClick={() => apply("threshold")}>
        T only
      </button>
      <button style={style} disabled={busy} onClick={() => apply("objective")}>
        O only
      </button>
    </div>
  );
}

/** The preset values and the stored ones when they differ. */
function RowValues({ row, stored, status }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 13, color: C.olive, marginTop: 4 }}>
      T {formatPresetValue(row, "threshold")} / O {formatPresetValue(row, "objective")}
      {row.direction ? <span style={{ ...st.meta, marginLeft: 8 }}>{DIRECTIONS[row.direction]}</span> : null}
      {status === "differs" ? (
        <div style={{ ...st.meta, color: C.noAttempt }}>
          Stored: T {formatStoredValue(stored.threshold, stored.unit)} / O {formatStoredValue(stored.objective, stored.unit)}
        </div>
      ) : null}
    </div>
  );
}

/** One preset row as a card. */
function PresetRow({ row, stored, isAdmin, busy, onApply }) {
  const [open, setOpen] = useState(false);
  const status = rowStatus(row, stored);
  const badge = SOURCE_BADGES[row.source];
  const pill = STATUS_PILLS[status];
  const canApply = isAdmin && isWritable(row);
  return (
    <div style={{ ...st.rowItem, flexDirection: "column", opacity: status === "na" ? 0.55 : 1 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <strong style={{ fontFamily: MONO, fontSize: 14 }}>{row.id}</strong>
        <span>{row.measure}</span>
        <span style={st.meta}>{row.units}</span>
        <span style={{ ...pillStyle(badge.color), fontSize: 10 }}>{badge.label}</span>
        <span style={{ ...pillStyle(pill.color), fontSize: 10 }}>{pill.label}</span>
      </div>
      {row.source === "not_covered" ? null : <RowValues row={row} stored={stored} status={status} />}
      {row.source === "not_covered" || open ? <div style={{ ...st.meta, marginTop: 4 }}>{row.basis}</div> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {row.source === "not_covered" ? null : (
          <button style={{ ...SMALL_BTN, border: "none", paddingLeft: 0 }} onClick={() => setOpen(!open)}>
            {open ? "Hide basis" : "Show basis"}
          </button>
        )}
        {canApply ? <RowButtons row={row} stored={stored} busy={busy} onApply={onApply} /> : null}
      </div>
    </div>
  );
}

/** One section with its header action. */
function PresetSection({ section, rows, benchmarks, scopeId, isAdmin, busy, onApply }) {
  const derived = writableBySource(rows, "derived");
  return (
    <div style={st.card}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 style={{ ...st.secHead, margin: 0 }}>{section}</h2>
        {isAdmin && derived.length > 0 ? (
          <button style={{ ...SMALL_BTN, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => onApply(itemsFor(derived))}>
            Apply derived in section ({derived.length})
          </button>
        ) : null}
      </div>
      {rows.map((row) => (
        <PresetRow
          key={row.id}
          row={row}
          stored={findStored(benchmarks, scopeId, row.id)}
          isAdmin={isAdmin}
          busy={busy}
          onApply={onApply}
        />
      ))}
    </div>
  );
}

/** The bulk actions across every section. */
function Toolbar({ rows, busy, onApply, onApplyJudgment }) {
  const derived = writableBySource(rows, "derived");
  const judgment = writableBySource(rows, "judgment");
  const style = { ...SMALL_BTN, opacity: busy ? 0.6 : 1 };
  return (
    <div style={{ ...st.card, display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button style={style} disabled={busy || derived.length === 0} onClick={() => onApply(itemsFor(derived))}>
        Apply all derived ({derived.length})
      </button>
      <button style={style} disabled={busy || judgment.length === 0} onClick={() => onApplyJudgment(itemsFor(judgment))}>
        Apply judgment presets ({judgment.length})
      </button>
    </div>
  );
}

/**
 * @param {{ rows: object[], benchmarks: object[], scopeId: number | null, isAdmin: boolean,
 *   busy: boolean, onApply: (items: object[]) => void, onApplyJudgment: (items: object[]) => void }} props
 */
export function PresetList({ rows, benchmarks, scopeId, isAdmin, busy, onApply, onApplyJudgment }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div>
      {isAdmin ? <Toolbar rows={rows} busy={busy} onApply={onApply} onApplyJudgment={onApplyJudgment} /> : null}
      {groupBySection(rows).map((group) => (
        <PresetSection
          key={group.section}
          section={group.section}
          rows={group.rows}
          benchmarks={benchmarks}
          scopeId={scopeId}
          isAdmin={isAdmin}
          busy={busy}
          onApply={onApply}
        />
      ))}
    </div>
  );
}
