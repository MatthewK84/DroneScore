import { C } from "../styles.js";

/**
 * The mark for one run's outcome. Color alone would fail red-green color
 * vision, so every outcome also has its own shape: a filled dot for a
 * success, a cross for a miss, and a hollow ring for no attempt. A label in
 * ink always travels with it somewhere on screen.
 */

/** Status color per outcome kind. */
export const OUTCOME_COLORS = Object.freeze({ good: C.success, bad: C.miss, none: C.noAttempt });

/** @returns {JSX.Element} The shape for one kind, drawn around (cx, cy). */
export function GlyphShape({ kind, cx, cy, r }) {
  const color = OUTCOME_COLORS[kind] || C.inkMuted;
  if (kind === "good") {
    return <circle cx={cx} cy={cy} r={r} fill={color} stroke={C.panel} strokeWidth={2} />;
  }
  if (kind === "bad") {
    const d = r * 0.85;
    return (
      <g stroke={color} strokeWidth={2.5} strokeLinecap="round">
        <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
        <line x1={cx - d} y1={cy + d} x2={cx + d} y2={cy - d} />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={r - 1} fill={C.panel} stroke={color} strokeWidth={2} />;
}

/** @param {{ kind: string, size?: number, title?: string }} props A standalone glyph. */
export function OutcomeGlyph({ kind, size = 16, title }) {
  const r = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title || kind} style={{ flex: "0 0 auto" }}>
      <GlyphShape kind={kind} cx={size / 2} cy={size / 2} r={r} />
    </svg>
  );
}
