import { getPublicProgress } from "../api.js";
import { usePolledResource } from "../hooks.js";
import { C, MONO, st } from "../styles.js";

/**
 * Progress of every interceptor toward JIATF 401 C4 criteria compliance,
 * for the read-only board. Each system is scored cumulatively, on every
 * run it has flown across the whole evaluation.
 *
 * The board is the general population, so this shows scores and counts
 * and nothing else: no measured values, no Threshold or Objective figures,
 * no system profile content. The server enforces that; this component
 * simply has nothing else to draw.
 *
 * Colors were chosen for the job they do, not taken from the score text
 * colors elsewhere in the app. Those use green, olive, and red, and red
 * against olive measures a Delta E of 2.7 under protanopia: identical to a
 * red-deficient reader, which is harmless where a printed 0, 1, or 2 carries
 * the meaning and fatal where the color is the meaning, as it is in a bar.
 * The set below separates every adjacent pair by at least 15.7 under every
 * simulated deficiency. Met is one cool hue, darker for Objective; Not met
 * is the warm pole; the pale track is what has not been evidenced yet.
 */

const POLL_MS = 60000;

const SEGMENTS = Object.freeze([
  { key: "objective", label: "Objective met", color: "#1E5A63" },
  { key: "threshold", label: "Threshold met", color: "#5E9EA8" },
  { key: "notMet", label: "Not met", color: "#C9502A" },
  { key: "pending", label: "Not Assessed", color: "#DDE1D6" },
]);

const SEGMENT_GAP_PX = 2;

/** @returns {string} A score out of two, or Not Assessed when nothing scored. */
function score(value) {
  return value === null || value === undefined ? "Not Assessed" : value.toFixed(2);
}

/** @returns {string} A score with its scale, or Not Assessed alone. */
function scoreOfTwo(value) {
  return value === null || value === undefined ? score(value) : `${score(value)} of 2`;
}

/**
 * Splits a system's rows into the four meter segments. The meter covers
 * only rows that can be scored: rows marked not applicable and
 * specification rows the criteria report without scoring are excluded, and
 * their count is stated beside the bar rather than hidden.
 *
 * @param {object} system Public progress for one interceptor.
 * @returns {{ counts: object, applicable: number, excluded: number, met: number }}
 */
function meterCounts(system) {
  const { attainment, states, total } = system;
  const excluded = states.not_applicable + states.reported;
  const counts = {
    objective: attainment.objective,
    threshold: attainment.threshold,
    notMet: attainment.notMet,
    // A vendor's performance claim is not evidence, so it counts as Not Assessed.
    pending: states.no_benchmark + states.not_measured + (states.claimed || 0),
  };
  return {
    counts,
    applicable: total - excluded,
    excluded,
    met: attainment.objective + attainment.threshold,
  };
}

/** Polls and renders progress for every interceptor. */
export function CriteriaProgress() {
  const { data, error, loading } = usePolledResource(getPublicProgress, POLL_MS);
  if (loading && !data) {
    return null;
  }
  if (!data) {
    return error ? <p style={st.meta}>Criteria progress is unavailable right now.</p> : null;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>JIATF 401 Criteria Progress</h2>
      <p style={{ ...st.meta, marginTop: -4, marginBottom: 14 }}>
        Each interceptor scored against the five C4 Core Capability Areas on every run it has
        flown so far. Updates as runs are logged.
      </p>
      {data.systems.length === 0 ? (
        <p style={{ fontSize: 14, color: C.ink, margin: 0 }}>
          No interceptor has flown a scored run yet.
        </p>
      ) : (
        data.systems.map((system) => <SystemProgress key={system.name} system={system} />)
      )}
      {data.unassignedRuns > 0 ? (
        <p style={{ ...st.meta, marginTop: 10 }}>
          {data.unassignedRuns} logged {data.unassignedRuns === 1 ? "run names" : "runs name"} no
          interceptor and {data.unassignedRuns === 1 ? "is" : "are"} not counted toward any system.
        </p>
      ) : null}
    </div>
  );
}

/** One interceptor's progress. */
function SystemProgress({ system }) {
  const meter = meterCounts(system);
  return (
    <section style={{ padding: "14px 0", borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontFamily: MONO, fontSize: 16, color: C.ink }}>{system.name}</strong>
        <span style={st.meta}>
          {system.daysFlown} {system.daysFlown === 1 ? "day" : "days"} · {system.redAirRuns} intercept runs ·
          Pk {system.pk === null ? "--" : system.pk.toFixed(2)}
        </span>
      </div>
      {system.notMilitarilyEffective ? <EffectivenessFlag failures={system.criticalFailures} /> : null}
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "12px 0 10px" }}>
        <StatTile label="Overall score" value={score(system.overall)} unit={system.overall === null ? "" : "of 2"} />
        <StatTile label="Criteria met" value={String(meter.met)} unit={`of ${meter.applicable}`} />
      </div>
      <Meter counts={meter.counts} applicable={meter.applicable} />
      <Legend counts={meter.counts} />
      {meter.excluded > 0 ? (
        <p style={{ ...st.meta, fontSize: 11, marginTop: 4 }}>
          {meter.excluded} of {system.total} rows {meter.excluded === 1 ? "is" : "are"} not scored:
          marked not applicable to this configuration, or specifications the criteria report
          without scoring.
        </p>
      ) : null}
      <AreaRow areas={system.areas} />
      <History history={system.history} />
    </section>
  );
}

/**
 * The Not Militarily Effective flag. Status color never carries the
 * meaning alone: it arrives with an icon and the words.
 */
function EffectivenessFlag({ failures }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        marginTop: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: `${C.miss}12`,
        border: `1px solid ${C.miss}55`,
      }}
    >
      <span aria-hidden="true" style={{ color: C.miss, fontWeight: 700, lineHeight: 1.3 }}>!</span>
      <span style={{ fontSize: 13, color: C.ink }}>
        <strong>Not Militarily Effective.</strong> A Critical KPP scored 0:{" "}
        {failures.map((entry) => `${entry.label} ${entry.measure}`).join("; ")}.
      </span>
    </div>
  );
}

/** A stat tile: sentence-case label over a proportional-figure value. */
function StatTile({ label, value, unit }) {
  return (
    <div>
      <div style={{ ...st.stripLabel, color: C.inkMuted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>{value}</span>
        <span style={st.meta}>{unit}</span>
      </div>
    </div>
  );
}

/**
 * The progress bar: one stacked bar across every scorable row. Segments
 * are separated by a surface gap rather than a stroke, and only the two
 * outer ends are rounded, so the bar reads as one whole divided.
 */
function Meter({ counts, applicable }) {
  if (applicable <= 0) {
    return null;
  }
  const present = SEGMENTS.filter((segment) => counts[segment.key] > 0);
  return (
    <div
      role="img"
      aria-label={SEGMENTS.map((segment) => `${segment.label} ${counts[segment.key]}`).join(", ")}
      style={{ display: "flex", gap: SEGMENT_GAP_PX, height: 12, width: "100%", marginBottom: 8 }}
    >
      {present.map((segment, index) => (
        <div
          key={segment.key}
          title={`${segment.label}: ${counts[segment.key]} of ${applicable} rows`}
          style={{
            flex: `${counts[segment.key]} 1 0`,
            minWidth: 3,
            background: segment.color,
            borderTopLeftRadius: index === 0 ? 4 : 0,
            borderBottomLeftRadius: index === 0 ? 4 : 0,
            borderTopRightRadius: index === present.length - 1 ? 4 : 0,
            borderBottomRightRadius: index === present.length - 1 ? 4 : 0,
          }}
        />
      ))}
    </div>
  );
}

/** Always-visible legend with counts, so no segment is identified by color alone. */
function Legend({ counts }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
      {SEGMENTS.map((segment) => (
        <span key={segment.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.ink }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: segment.color, flex: "0 0 auto" }} />
          {segment.label}
          <span style={{ fontFamily: MONO, color: C.inkMuted, fontVariantNumeric: "tabular-nums" }}>
            {counts[segment.key]}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The five Core Capability Area scores as a row of small figures. */
function AreaRow({ areas }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 14 }}>
      {areas.map((area) => (
        <div key={area.id} title={area.name} style={{ textAlign: "center", padding: "6px 2px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
          <div style={{ ...st.stripLabel, fontSize: 9, color: C.inkMuted }}>Crit {area.id}</div>
          <div style={{ fontSize: area.score === null ? 10 : 17, fontWeight: 600, color: area.score === null ? C.inkMuted : C.ink }}>
            {score(area.score)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkMuted }}>
            {area.scored}/{area.total}
          </div>
        </div>
      ))}
    </div>
  );
}

const SPARK = Object.freeze({ width: 280, height: 56, pad: 8 });

/**
 * The change from the first scored day to the latest, printed beside the
 * line. On the fixed 0 to 2 scale a real gain of a tenth of a point is a
 * few pixels, easy to read as no progress at all; the signed figure says
 * what the line cannot without exaggerating the line itself.
 */
function Delta({ first, last }) {
  if (first === last) {
    return null;
  }
  const change = last.entry.overall - first.entry.overall;
  const sign = change > 0 ? "+" : change < 0 ? "\u2212" : "\u00b1";
  return (
    <span style={{ ...st.meta, display: "block" }}>
      {sign}{Math.abs(change).toFixed(2)} since {shortDate(first.entry.date)}
    </span>
  );
}

/** @returns {{ x: number, y: number }[]} Sparkline coordinates on a fixed 0 to 2 scale. */
function sparkPoints(history) {
  const usableWidth = SPARK.width - SPARK.pad * 2;
  const usableHeight = SPARK.height - SPARK.pad * 2;
  const step = history.length > 1 ? usableWidth / (history.length - 1) : 0;
  return history.map((point, index) => ({
    x: SPARK.pad + index * step,
    y: point.overall === null ? null : SPARK.pad + usableHeight * (1 - point.overall / 2),
  }));
}

/** @returns {string} A readable short date, e.g. "Sep 11". */
function shortDate(iso) {
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Overall score after each day flown. The scale is fixed at 0 to 2, the
 * whole range the criteria define, so a small rise is never stretched into
 * a dramatic one. A day with nothing scored breaks the line rather than
 * dropping it to zero. The table under it is the same data, for anyone who
 * cannot or would rather not read a line.
 */
function History({ history }) {
  if (history.length < 2) {
    return null;
  }
  const points = sparkPoints(history);
  const drawn = points.map((point, index) => ({ ...point, entry: history[index] })).filter((point) => point.y !== null);
  const path = drawn.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const last = drawn[drawn.length - 1];
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...st.stripLabel, color: C.inkMuted, marginBottom: 4 }}>Overall score by day</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg
          viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
          style={{ width: "100%", maxWidth: SPARK.width, height: "auto", display: "block" }}
          role="img"
          aria-label={`Overall score by day, from ${score(history[0].overall)} to ${score(history[history.length - 1].overall)}`}
        >
          <line x1={SPARK.pad} x2={SPARK.width - SPARK.pad} y1={SPARK.height - SPARK.pad} y2={SPARK.height - SPARK.pad} stroke={C.line} strokeWidth="1" />
          <path d={path} fill="none" stroke="#5E9EA8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {last ? <circle cx={last.x} cy={last.y} r="4" fill="#1E5A63" stroke={C.panel} strokeWidth="2" /> : null}
          {drawn.map((point) => (
            <circle key={point.entry.date} cx={point.x} cy={point.y} r="12" fill="transparent">
              <title>{`${shortDate(point.entry.date)}: ${scoreOfTwo(point.entry.overall)}, ${point.entry.scored} rows scored`}</title>
            </circle>
          ))}
        </svg>
        {last ? (
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{score(last.entry.overall)}</span>
            <Delta first={drawn[0]} last={last} />
          </span>
        ) : null}
      </div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ ...st.meta, cursor: "pointer" }}>By day</summary>
        <table style={{ ...st.table, minWidth: 0, marginTop: 6 }}>
          <thead>
            <tr>
              <th style={st.th}>Day</th>
              <th style={st.th}>Overall</th>
              <th style={st.th}>Rows scored</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.date}>
                <td style={st.tdMono}>{shortDate(entry.date)}</td>
                <td style={st.tdMono}>{score(entry.overall)}</td>
                <td style={st.tdMono}>{entry.scored}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
