import { C, MONO, st } from "../styles.js";
import { PHASES } from "../preset-logic.js";

/**
 * Both levels drawn as horizontal bars split by phase, each on its own
 * time scale. Below each bar, every boundary carries the range remaining
 * when that milestone completes.
 */

const PHASE_COLORS = Object.freeze({
  track: C.olive,
  classify: C.success,
  identify: C.noAttempt,
  decide: C.orange,
  effect: C.miss,
  assess: C.inkMuted,
});

const LEVELS = Object.freeze([
  { key: "threshold", title: "Threshold" },
  { key: "objective", title: "Objective" },
]);

/** @returns {object[]} The milestones of one level, in kill chain order. */
function milestonesFor(milestones, level) {
  return milestones.filter((entry) => entry.level === level);
}

/** One level's bar and boundary labels. */
function LevelBar({ title, points }) {
  const total = points.length === 0 ? 0 : points[points.length - 1].elapsedS;
  if (total <= 0) {
    return null;
  }
  const segments = PHASES.map((phase, index) => ({
    phase,
    seconds: points[index + 1].elapsedS - points[index].elapsedS,
  }));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...st.label, marginBottom: 4 }}>
        {title}: {total} s
      </div>
      <div style={{ display: "flex", height: 18, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
        {segments.map((segment) => (
          <div
            key={segment.phase}
            title={`${segment.phase}: ${segment.seconds} s`}
            style={{ width: `${(segment.seconds / total) * 100}%`, background: PHASE_COLORS[segment.phase] }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 6 }}>
        {points.map((point) => (
          <span key={point.milestone} style={{ fontFamily: MONO, fontSize: 11, color: C.inkMuted }}>
            {point.milestone} {point.elapsedS} s @ {point.rangeKm} km
          </span>
        ))}
      </div>
    </div>
  );
}

/** A small legend matching phase to color. */
function Legend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
      {PHASES.map((phase) => (
        <span key={phase} style={{ fontFamily: MONO, fontSize: 11, color: C.ink }}>
          <span style={{ display: "inline-block", width: 10, height: 10, marginRight: 4, background: PHASE_COLORS[phase] }} />
          {phase}
        </span>
      ))}
    </div>
  );
}

/** @param {{ milestones: object[] }} props Output of timelineMilestones. */
export function TimelineStrip({ milestones }) {
  if (milestones.length === 0) {
    return null;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Kill Chain Timeline</h2>
      <p style={{ ...st.meta, marginBottom: 10 }}>Each label shows elapsed time and range remaining when that step ends.</p>
      {LEVELS.map((level) => (
        <LevelBar key={level.key} title={level.title} points={milestonesFor(milestones, level.key)} />
      ))}
      <Legend />
    </div>
  );
}
