import { useCallback, useEffect, useRef, useState } from "react";
import { chronological, clockOf, outcomeView } from "../engagement-view.js";
import { C, MONO, st } from "../styles.js";
import { GlyphShape } from "./OutcomeGlyph.jsx";

/**
 * Every run of the day in the order it was flown, one mark per run. Intercept
 * runs and abort runs sit in separate lanes, because aborts are excluded
 * from Pk. Tapping, hovering, or focusing a mark shows that run.
 */

const PAD = 16;
const MIN_STEP = 22;
const LANE_H = 34;
const LABEL_H = 14;
const AXIS_H = 20;
const MARK_R = 6;
const HIT_W = 24;

/** Tracks the rendered width of an element, in CSS pixels. */
function useWidth(ref) {
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const measure = () => {
      if (ref.current) {
        setWidth(ref.current.clientWidth);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);
  return width;
}

/** @returns {number} Horizontal spacing that fills the width, never below the minimum. */
function stepFor(count, width) {
  return count <= 1 ? 0 : Math.max(MIN_STEP, (width - PAD * 2) / (count - 1));
}

/** @returns {string} What a screen reader hears for one mark. */
function describeRun(run, index) {
  const time = run.timeToInterceptS === null || run.timeToInterceptS === undefined ? "" : `, ${run.timeToInterceptS} seconds`;
  return `Run ${index + 1} at ${clockOf(run)}: ${run.interceptorName || "Unassigned"} versus ${run.droneName || "Unassigned"}, ${outcomeView(run).label}${time}`;
}

/**
 * One lane of marks with its label. Marks sit at their place in the whole
 * day's order, so the two lanes line up in time and leave gaps where the
 * other lane's runs were flown.
 */
function Lane({ label, runs, top, step, orderOf, onSelect }) {
  return (
    <g>
      <text x={PAD - 8} y={top + 10} fontFamily={MONO} fontSize={10} fill={C.inkMuted}>
        {label}
      </text>
      {runs.map((run) => {
        const index = orderOf.get(run.id);
        const cx = PAD + index * step;
        const cy = top + LABEL_H + LANE_H / 2;
        return (
          <g
            key={run.id}
            tabIndex={0}
            role="img"
            aria-label={describeRun(run, index)}
            onPointerEnter={() => onSelect({ run, index, x: cx })}
            onFocus={() => onSelect({ run, index, x: cx })}
            onClick={() => onSelect({ run, index, x: cx })}
            style={{ cursor: "pointer", outline: "none" }}
          >
            <rect x={cx - HIT_W / 2} y={top + LABEL_H} width={HIT_W} height={LANE_H} fill="transparent" />
            <GlyphShape kind={outcomeView(run).kind} cx={cx} cy={cy} r={MARK_R} />
          </g>
        );
      })}
    </g>
  );
}

/** The run a mark points at, value first. */
function Tooltip({ selected, width }) {
  if (selected === null) {
    return null;
  }
  const { run, index, x } = selected;
  const left = Math.min(Math.max(x - 90, 0), Math.max(width - 180, 0));
  const tti = run.timeToInterceptS === null || run.timeToInterceptS === undefined ? null : `${run.timeToInterceptS} s`;
  return (
    <div role="status" style={{ position: "absolute", top: -6, left, width: 180, transform: "translateY(-100%)", background: C.ink, color: C.panel, borderRadius: 8, padding: "8px 10px", fontSize: 12, pointerEvents: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{tti || outcomeView(run).label}</div>
      <div>{`${run.interceptorName || "Unassigned"} vs ${run.droneName || "Unassigned"}`}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, opacity: 0.8 }}>{`Run ${index + 1} · ${clockOf(run)} · ${outcomeView(run).label}`}</div>
    </div>
  );
}

/** First and last run times under the strip. */
function Axis({ runs, top, width }) {
  if (runs.length === 0) {
    return null;
  }
  return (
    <g fontFamily={MONO} fontSize={10} fill={C.inkMuted}>
      <line x1={PAD} y1={top} x2={width - PAD} y2={top} stroke={C.line} strokeWidth={1} />
      <text x={PAD} y={top + 14}>{clockOf(runs[0])}</text>
      <text x={width / 2} y={top + 14} textAnchor="middle">Order flown →</text>
      <text x={width - PAD} y={top + 14} textAnchor="end">{clockOf(runs[runs.length - 1])}</text>
    </g>
  );
}

/** @param {{ redAir: object[], aborts: object[] }} props Runs, oldest first. */
export function RunStrip({ redAir, aborts }) {
  const frame = useRef(null);
  const scroller = useRef(null);
  const available = useWidth(frame);
  const [selected, setSelected] = useState(null);
  const clear = useCallback(() => setSelected(null), []);
  const select = useCallback((pick) => {
    setSelected({ ...pick, x: pick.x - (scroller.current ? scroller.current.scrollLeft : 0) });
  }, []);
  const all = chronological([...redAir, ...aborts]);
  const orderOf = new Map(all.map((run, index) => [run.id, index]));
  const step = stepFor(all.length, available);
  const width = Math.max(available, PAD * 2 + (all.length - 1) * step);
  const lanes = [{ label: "Intercept runs", runs: redAir }, { label: "Abort runs", runs: aborts }].filter((lane) => lane.runs.length > 0);
  const height = lanes.length * (LABEL_H + LANE_H) + AXIS_H;
  return (
    <div ref={frame} style={{ position: "relative", zIndex: 1 }} onPointerLeave={clear} onBlur={clear}>
      <Tooltip selected={selected} width={available} />
      <div ref={scroller} style={st.tableWrap} onScroll={clear}>
        <svg width={width} height={height} role="group" aria-label="Runs in the order flown">
          {lanes.map((lane, index) => (
            <Lane key={lane.label} label={lane.label} runs={lane.runs} top={index * (LABEL_H + LANE_H)} step={step} orderOf={orderOf} onSelect={select} />
          ))}
          <Axis runs={all} top={lanes.length * (LABEL_H + LANE_H) + 2} width={width} />
        </svg>
      </div>
    </div>
  );
}
