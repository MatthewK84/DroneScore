import { useEffect, useState } from "react";
import {
  barShare,
  clockOf,
  formatPk,
  interceptorTallies,
  isRecent,
  newestFirst,
  outcomeView,
  slowestTti,
  splitRuns,
  weatherChips,
} from "../engagement-view.js";
import { C, MONO, st } from "../styles.js";
import { OutcomeGlyph } from "./OutcomeGlyph.jsx";
import { RunStrip } from "./RunStrip.jsx";

/**
 * The day's engagements, drawn to be read at a glance: a strip of every run
 * in the order flown, a scoreboard per interceptor, and a card per run,
 * newest first. The public board and the Score tab share it. The Score tab
 * adds each run's notes and its edit controls. Nothing here shows a
 * Threshold or Objective: time-to-intercept bars scale to the day's slowest
 * run, never to a benchmark.
 */

/** How often the clock behind the NEW tag advances. */
const NOW_TICK_MS = 30000;

/** The current time, advanced on an interval so NEW tags expire by themselves. */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const LEGEND = Object.freeze([
  { kind: "good", label: "Success" },
  { kind: "bad", label: "Miss" },
  { kind: "none", label: "No attempt" },
]);

/** The shape key for the strip and the dots. */
function Legend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 6 }}>
      {LEGEND.map((entry) => (
        <span key={entry.kind} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.ink }}>
          <OutcomeGlyph kind={entry.kind} size={12} title={entry.label} />
          {entry.label}
        </span>
      ))}
      <span style={{ ...st.meta, fontSize: 11 }}>On abort runs a dot means the abort worked.</span>
    </div>
  );
}

/** One interceptor's line on the scoreboard. */
function TallyLine({ tally }) {
  return (
    <div style={{ ...st.rowItem, alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontFamily: MONO, fontSize: 14 }}>{tally.name}</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }} aria-hidden="true">
          {tally.runs.map((run) => (
            <OutcomeGlyph key={run.id} kind={outcomeView(run).kind} size={12} />
          ))}
        </div>
        <div style={{ ...st.meta, marginTop: 4 }}>
          {tally.successes} of {tally.attempts} hits
          {tally.meanTtiS === null ? "" : ` · mean time to intercept ${tally.meanTtiS} s`}
        </div>
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto" }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{formatPk(tally.pk)}</div>
        <div style={{ ...st.stripLabel, color: C.inkMuted }}>Pk</div>
      </div>
    </div>
  );
}

/** Time to intercept as a bar against the day's slowest run, value at the tip. */
function TtiBar({ value, max }) {
  if (value === null || value === undefined) {
    return null;
  }
  const share = barShare(value, max);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }} aria-label={`Time to intercept ${value} seconds`}>
      <span style={{ ...st.meta, fontSize: 10, width: 28 }}>TTI</span>
      <div style={{ flex: 1, height: 8, background: C.oliveSoft, borderRadius: 4, overflow: "hidden", maxWidth: 260 }}>
        <div style={{ width: `${Math.max(share * 100, 2)}%`, height: "100%", background: C.olive, borderRadius: "0 4px 4px 0" }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink, minWidth: 42 }}>{value} s</span>
    </div>
  );
}

/** Small chips for the weather captured when the run was scored. */
function WeatherChips({ weather }) {
  const chips = weatherChips(weather);
  if (chips.length === 0) {
    return null;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {chips.map((chip) => (
        <span key={chip} style={{ fontFamily: MONO, fontSize: 10, color: C.olive, background: C.oliveSoft, borderRadius: 999, padding: "2px 8px" }}>
          {chip}
        </span>
      ))}
    </div>
  );
}

/** The line under a card's title: time, sortie, and on the Score tab the scenario. */
function metaLine(engagement, detailed) {
  const parts = [clockOf(engagement), engagement.sortie];
  if (detailed && engagement.scenario) {
    parts.push(engagement.scenario.toUpperCase());
  }
  return parts.filter((part) => part).join(" · ");
}

/** One run as a card. */
function EngagementCard({ engagement, maxTti, nowMs, detailed, renderActions }) {
  const outcome = outcomeView(engagement);
  const fresh = isRecent(engagement, nowMs);
  return (
    <div style={{ ...st.rowItem, background: fresh ? `${C.olive}0D` : "transparent", paddingLeft: 8, paddingRight: 8, borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 12, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 64, flex: "0 0 auto" }}>
          <OutcomeGlyph kind={outcome.kind} size={26} title={outcome.label} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink, textTransform: "uppercase", textAlign: "center", marginTop: 4 }}>{outcome.label}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{engagement.interceptorName || "Unassigned"}</strong>
            <span style={st.meta}>vs {engagement.droneName || "Unassigned"}</span>
            {fresh ? <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.panel, background: C.olive, borderRadius: 4, padding: "1px 5px" }}>NEW</span> : null}
          </div>
          <div style={{ ...st.meta, marginTop: 2 }}>{metaLine(engagement, detailed)}</div>
          <TtiBar value={engagement.timeToInterceptS} max={maxTti} />
          <WeatherChips weather={engagement.weather} />
          {detailed && engagement.notes ? <div style={{ fontSize: 13, color: C.ink, marginTop: 6 }}>{engagement.notes}</div> : null}
          {renderActions ? <div style={{ marginTop: 10 }}>{renderActions(engagement)}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** A titled list of run cards, newest first. */
function CardList({ title, note, runs, maxTti, nowMs, detailed, renderActions }) {
  if (runs.length === 0) {
    return null;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>
        {title} ({runs.length})
      </h2>
      {note ? <p style={{ ...st.meta, marginTop: -6, marginBottom: 10 }}>{note}</p> : null}
      {newestFirst(runs).map((engagement) => (
        <EngagementCard key={engagement.id} engagement={engagement} maxTti={maxTti} nowMs={nowMs} detailed={detailed} renderActions={renderActions} />
      ))}
    </div>
  );
}

/**
 * @param {{ engagements: object[], detailed?: boolean,
 *   renderActions?: (engagement: object) => JSX.Element }} props
 */
export function EngagementBoard({ engagements, detailed = false, renderActions }) {
  const { redAir, aborts } = splitRuns(engagements);
  const maxTti = slowestTti(engagements);
  const tallies = interceptorTallies(redAir);
  const nowMs = useNow(NOW_TICK_MS);
  return (
    <div>
      <div style={st.card}>
        <h2 style={st.secHead}>Today&apos;s Runs</h2>
        <Legend />
        <RunStrip redAir={redAir} aborts={aborts} />
      </div>
      {tallies.length > 0 ? (
        <div style={st.card}>
          <h2 style={st.secHead}>By Interceptor</h2>
          {tallies.map((tally) => (
            <TallyLine key={tally.name} tally={tally} />
          ))}
        </div>
      ) : null}
      <CardList title="Red Air Intercept Runs" runs={redAir} maxTti={maxTti} nowMs={nowMs} detailed={detailed} renderActions={renderActions} />
      <CardList title="Intentional Abort Runs" note="Abort runs test the abort command and are excluded from Pk." runs={aborts} maxTti={maxTti} nowMs={nowMs} detailed={detailed} renderActions={renderActions} />
    </div>
  );
}
