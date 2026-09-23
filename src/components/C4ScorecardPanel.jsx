import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getCurrentDay, getDayCriteria, saveSystemProfile } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";

/**
 * The consolidated C4 scorecard.
 *
 * This is the criteria document itself, rendered live: the five Core
 * Capability Areas with every row the document prints, in the document's
 * order, with the document's columns. The Measured column fills itself
 * from the runs already logged on the Score tab, so a scorer who logs an
 * engagement has, by that action alone, scored every row the engagement
 * bears on. Nothing on this screen asks for a number twice.
 *
 * What this screen still needs a person for is the two things the document
 * says are decided before testing rather than during it: the Threshold and
 * Objective, set on the Benchmarks view, and which KPPs are Critical, set
 * beside them. A row with neither is reported as having no benchmark and
 * is kept out of the score rather than counted as a pass.
 */

const STATE_LABELS = Object.freeze({
  scored: "",
  not_applicable: "N/A",
  reported: "Reported",
  no_benchmark: "No T/O",
  not_measured: "No data",
});

const SCORE_COLORS = Object.freeze({ 0: C.miss, 1: C.olive, 2: C.success });

/** The scoring rules, quoted from section 2 of the criteria. */
const SCORING_RULES = Object.freeze([
  "0 = Not Met, below Threshold",
  "1 = Met Threshold",
  "2 = Met or Exceeded Objective",
  "N/A = Not applicable to this interceptor configuration",
]);

/** @returns {string} A score or its state, rendered for the Score column. */
function scoreText(row) {
  return row.state === "scored" ? String(row.score) : STATE_LABELS[row.state] || "--";
}

/** @returns {string} A benchmark limit rendered for the screen. */
function limit(value) {
  return value === null || value === undefined ? "--" : String(value);
}

/** @returns {string} An area or overall score rendered out of two. */
function outOfTwo(value) {
  return value === null || value === undefined ? "--" : `${value.toFixed(2)} / 2`;
}

/** @param {{ isAdmin: boolean, interceptors: object[] }} props */
export function C4ScorecardPanel({ isAdmin, interceptors }) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const reload = useCallback(async () => {
    try {
      const current = await getCurrentDay();
      setReview(await getDayCriteria(current.day.id));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to build the scorecard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * The system being shown. Each interceptor flown today has its own
   * package, derived from its own runs; the primary system opens first.
   * A selection that no longer exists after a reload falls back to it.
   */
  const shown = useMemo(() => {
    const packages = review?.systems || [];
    return packages.find((pkg) => pkg.system.interceptorId === selectedId) || packages[0] || review;
  }, [review, selectedId]);

  const system = useMemo(
    () => interceptors.find((entry) => entry.id === shown?.system?.interceptorId) || null,
    [interceptors, shown]
  );

  /**
   * Marking a row Not Applicable is a property of the interceptor
   * configuration, so it is stored on that system's profile and applies to
   * every day it flies rather than to this day alone.
   */
  const toggleNotApplicable = useCallback(
    async (rowId, nextValue) => {
      if (system === null || busyRow !== "") {
        return;
      }
      setBusyRow(rowId);
      setError("");
      try {
        await saveSystemProfile(system.id, { ...(system.profile || {}), [`na.${rowId}`]: nextValue });
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to save the applicability mark.");
      } finally {
        setBusyRow("");
      }
    },
    [system, busyRow, reload]
  );

  if (loading) {
    return <Loading label="Scoring the criteria..." />;
  }

  if (review === null || !review.scorecard) {
    return <Notice tone="error">{error || "The scorecard is unavailable."}</Notice>;
  }

  const canMark = isAdmin && system !== null;
  return (
    <div>
      <SystemPicker
        systems={review.systems || []}
        selectedId={shown.system.interceptorId}
        onSelect={setSelectedId}
        unassigned={review.unassignedRuns || 0}
      />
      <ScoreHeader pkg={shown} />
      {error ? <p style={st.error}>{error}</p> : null}
      {shown.scorecard.areas.map((area) => (
        <AreaCard
          key={area.id}
          area={area}
          canMark={canMark}
          busyRow={busyRow}
          onToggle={toggleNotApplicable}
        />
      ))}
      <SupportingCard groups={shown.scorecard.supporting} />
      <TimelineCard timeline={shown.timeline} />
    </div>
  );
}

/**
 * One chip per interceptor flown today, each with its overall score, so
 * the systems can be compared at a glance before opening one. Hidden when
 * only one system flew, because there is nothing to choose between.
 */
function SystemPicker({ systems, selectedId, onSelect, unassigned }) {
  if (systems.length < 2 && unassigned === 0) {
    return null;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Systems Flown Today</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {systems.map((pkg) => {
          const active = pkg.system.interceptorId === selectedId;
          return (
            <button
              key={pkg.system.interceptorId}
              onClick={() => onSelect(pkg.system.interceptorId)}
              style={{
                ...st.ghostBtn,
                textTransform: "none",
                letterSpacing: 0,
                fontFamily: MONO,
                fontSize: 12,
                borderColor: active ? C.olive : C.line,
                color: active ? C.olive : C.inkMuted,
                background: active ? C.oliveSoft : "transparent",
              }}
            >
              {pkg.system.name} · {outOfTwo(pkg.scorecard.overall)}
              {pkg.scorecard.notMilitarilyEffective ? " · NME" : ""}
            </button>
          );
        })}
      </div>
      <p style={{ ...st.meta, marginTop: 10 }}>
        Each system is scored from its own runs only; the primary system is listed first. Every
        system shares the day&apos;s range space, so the day closeout applies to each of them.
        {unassigned > 0
          ? ` ${unassigned} ${unassigned === 1 ? "run names" : "runs name"} no interceptor and ${unassigned === 1 ? "is" : "are"} not counted toward any system.`
          : ""}
      </p>
    </div>
  );
}

/** Overall System Score, the five area scores, and the effectiveness flag. */
function ScoreHeader({ pkg }) {
  const { scorecard, system } = pkg;
  const group = pkg.uasGroup;
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Overall System Score</h2>
      <div style={{ fontFamily: MONO, fontSize: 40, color: C.olive, lineHeight: 1 }}>
        {outOfTwo(scorecard.overall)}
      </div>
      <p style={{ ...st.meta, marginTop: 6 }}>
        Weighted average of the five Core Capability Areas at equal weight.{" "}
        {scorecard.states.scored} of {scorecard.total} rows carry a score. Of the rest:{" "}
        {scorecard.states.no_benchmark} with no Threshold or Objective stored,{" "}
        {scorecard.states.not_measured} with no measurement yet,{" "}
        {scorecard.states.reported} reported as specifications the criteria do not score,{" "}
        {scorecard.states.not_applicable} marked not applicable. Only scored rows enter
        the average, so a row left unbenchmarked lowers coverage rather than the score.
      </p>
      {scorecard.notMilitarilyEffective ? (
        <Notice tone="error">
          Not Militarily Effective. A Critical KPP scored 0:{" "}
          {scorecard.criticalFailures.map((entry) => `${entry.label} ${entry.measure}`).join("; ")}.
        </Notice>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, marginTop: 12 }}>
        {scorecard.areas.map((area) => (
          <div key={area.id} style={{ textAlign: "center", padding: "8px 4px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <div style={{ ...st.stripLabel, color: C.inkMuted }}>Criterion {area.id}</div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: area.score === null ? C.inkMuted : C.olive }}>
              {area.score === null ? "--" : area.score.toFixed(2)}
            </div>
            <div style={{ ...st.meta, fontSize: 10 }}>
              {area.states.scored}/{area.total} scored
            </div>
          </div>
        ))}
      </div>
      <p style={{ ...st.meta, marginTop: 12 }}>
        {SCORING_RULES.join("   ·   ")}
      </p>
      <p style={{ ...st.meta, marginTop: 6 }}>
        System under test: {system.name || "none logged"}
        {group ? ` against Group ${group}` : ""}, scored from its own runs only.
      </p>
    </div>
  );
}

/** One Core Capability Area, with each of its tables. */
function AreaCard({ area, canMark, busyRow, onToggle }) {
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>
        Criterion {area.id} - {area.name}
      </h2>
      {area.note ? <p style={{ ...st.meta, marginBottom: 8 }}>{area.note}</p> : null}
      <p style={{ ...st.meta, marginBottom: 12 }}>
        Area score {outOfTwo(area.score)} from {area.states.scored} of {area.total} rows.
      </p>
      {area.sections.map((section) => (
        <SectionTable
          key={section.title}
          section={section}
          canMark={canMark}
          busyRow={busyRow}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

/** One criteria table, reproduced column for column. */
function SectionTable({ section, canMark, busyRow, onToggle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontFamily: MONO, fontSize: 13, color: C.ink, margin: "0 0 2px" }}>{section.title}</h3>
      {section.note ? <p style={{ ...st.meta, marginBottom: 6 }}>{section.note}</p> : null}
      <p style={{ ...st.meta, fontSize: 10, marginBottom: 4 }}>
        Scrolls sideways on a narrow screen.
      </p>
      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>ID</th>
              <th style={st.th}>MOP / KPP</th>
              <th style={st.th}>Unit</th>
              <th style={st.th}>Description</th>
              <th style={st.th}>Measured</th>
              <th style={st.th}>Thresh.</th>
              <th style={st.th}>Obj.</th>
              <th style={st.th}>Score</th>
              <th style={st.th}>Notes</th>
              {canMark ? <th style={st.th}>N/A</th> : null}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <ScoreRow
                key={row.id}
                row={row}
                canMark={canMark}
                busy={busyRow === row.id}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A single criteria row. */
function ScoreRow({ row, canMark, busy, onToggle }) {
  const applicable = row.state !== "not_applicable";
  return (
    <tr style={{ opacity: applicable ? 1 : 0.55 }}>
      <td style={{ ...st.tdMono, fontWeight: 600 }}>
        {row.label}
        {row.critical ? (
          <div style={{ fontSize: 9, color: C.orange, letterSpacing: "0.06em" }}>CRITICAL</div>
        ) : null}
      </td>
      <td style={st.td}>{row.measure}</td>
      <td style={st.tdMono}>{row.units}</td>
      <td style={{ ...st.td, minWidth: 128, color: C.inkMuted }}>{row.description}</td>
      <td style={{ ...st.tdMono, color: row.measuredText ? C.ink : C.inkMuted }}>
        {row.measuredText || "--"}
      </td>
      <td style={st.tdMono}>{limit(row.threshold)}</td>
      <td style={st.tdMono}>{limit(row.objective)}</td>
      <td
        style={{
          ...st.tdMono,
          fontWeight: 700,
          color: row.state === "scored" ? SCORE_COLORS[row.score] : C.inkMuted,
        }}
      >
        {scoreText(row)}
      </td>
      <td style={{ ...st.td, minWidth: 96, fontSize: 11, color: C.inkMuted }}>
        {row.source ? <div>{row.source}</div> : null}
        {row.notes ? <div style={{ fontStyle: "italic" }}>{row.notes}</div> : null}
      </td>
      {canMark ? (
        <td style={st.td}>
          <button
            style={{ ...st.ghostBtn, padding: "4px 8px", fontSize: 10, opacity: busy ? 0.5 : 1 }}
            disabled={busy}
            onClick={() => onToggle(row.id, applicable ? "yes" : "")}
          >
            {applicable ? "Mark N/A" : "Restore"}
          </button>
        </td>
      ) : null}
    </tr>
  );
}

/**
 * Supporting KPP groups, operator usability, and mission impact. The
 * criteria carry these outside the five Core Capability Areas, so they are
 * reported in full here and never folded into the Overall System Score.
 */
function SupportingCard({ groups }) {
  const [open, setOpen] = useState(false);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Supporting KPP Groups, Usability, and Mission Impact</h2>
      <p style={{ ...st.meta, marginBottom: 10 }}>
        Sections 4 through 6 of the criteria, {total} entries. These are reported but do
        not enter the Overall System Score, which the criteria define over the five Core
        Capability Areas alone.
      </p>
      <button style={{ ...st.ghostBtn, width: "100%", marginBottom: 12 }} onClick={() => setOpen(!open)}>
        {open ? "Hide supporting groups" : `Show all ${total} supporting entries`}
      </button>
      {open
        ? groups.map((group) => <SupportingGroup key={group.name} group={group} />)
        : null}
    </div>
  );
}

/** One supporting group's table. */
function SupportingGroup({ group }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontFamily: MONO, fontSize: 13, color: C.ink, margin: "0 0 6px" }}>
        Section {group.section} - {group.name}
      </h3>
      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>ID</th>
              <th style={st.th}>Measure</th>
              <th style={st.th}>Unit</th>
              <th style={st.th}>Measured</th>
              <th style={st.th}>Thresh.</th>
              <th style={st.th}>Obj.</th>
              <th style={st.th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={row.id}>
                <td style={{ ...st.tdMono, fontWeight: 600 }}>{row.label}</td>
                <td style={st.td}>{row.measure}</td>
                <td style={st.tdMono}>{row.units}</td>
                <td style={st.tdMono}>
                  {row.detail || (row.measured === null ? "--" : row.measured)}
                </td>
                <td style={st.tdMono}>{limit(row.threshold)}</td>
                <td style={st.tdMono}>{limit(row.objective)}</td>
                <td style={{ ...st.td, fontSize: 11, color: C.inkMuted }}>{row.source || "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** @returns {string} A timeline cell rendered with its sample count. */
function phaseText(value, count) {
  if (value === null || value === undefined) {
    return "--";
  }
  return count === undefined ? `${value}` : `${value} (n=${count})`;
}

/**
 * Section 7, the engagement timeline. Every phase is a mean over the runs
 * that carried that timing, split by the scenario each run was flown
 * under, so the comparison the criteria ask for needs no separate entry.
 */
function TimelineCard({ timeline }) {
  if (!timeline) {
    return null;
  }
  const rows = [...timeline.phases, timeline.total];
  const total = timeline.total;
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Engagement Timeline Analysis</h2>
      <p style={{ ...st.meta, marginBottom: 10 }}>
        Mean seconds per phase across the day&apos;s intercept runs, split by scenario.
        The total covers {total.coveredPhases.mlcoa} of {total.phaseCount} phases under
        MLCOA and {total.coveredPhases.mdcoa} of {total.phaseCount} under MDCOA; a phase
        with no captured timing is left blank rather than counted as zero.
      </p>
      <div style={st.tableWrap}>
        <table style={{ ...st.table, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={st.th}>Phase</th>
              <th style={st.th}>MLCOA (sec)</th>
              <th style={st.th}>MDCOA (sec)</th>
              <th style={st.th}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.phase}>
                <td style={{ ...st.td, fontWeight: row.n === undefined ? 700 : 400 }}>{row.phase}</td>
                <td style={st.tdMono}>{phaseText(row.mlcoa, row.n?.mlcoa)}</td>
                <td style={st.tdMono}>{phaseText(row.mdcoa, row.n?.mdcoa)}</td>
                <td style={st.tdMono}>{row.delta === null ? "--" : row.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
