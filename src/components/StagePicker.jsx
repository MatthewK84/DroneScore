import { useState } from "react";
import { C, MONO, st } from "../styles.js";

/**
 * Kill chain capture for a single run.
 *
 * The framework asks for detection, tracking, classification,
 * identification, engagement, and defeat as separate measures. Asking a
 * scorer six yes/no questions between serials is how a data set ends up
 * half empty. The stages are ordered, so one tap on the furthest stage a
 * run reached answers all six at once, and everything below it is implied.
 *
 * The advanced panel below is progressive: a run that never tracked is
 * never asked for track continuity, because a blank field a scorer could
 * not have filled is noise on the way to a report.
 */

/** Scenario keys the criteria split the engagement timeline by. */
export const SCENARIOS = Object.freeze([
  { key: "mlcoa", label: "MLCOA", hint: "Most likely" },
  { key: "mdcoa", label: "MDCOA", hint: "Most dangerous" },
]);

/** Stage keys in kill chain order. Mirrors server/criteria.js. */
const STAGES = Object.freeze([
  { key: "none", label: "No Detect", hint: "Flew, never seen" },
  { key: "detect", label: "Detect", hint: "Seen, no track" },
  { key: "track", label: "Track", hint: "Tracked only" },
  { key: "classify", label: "Classify", hint: "Known sUAS" },
  { key: "identify", label: "Identify", hint: "Type known" },
  { key: "engage", label: "Engage", hint: "Fired, no kill" },
  { key: "defeat", label: "Defeat", hint: "Neutralized" },
]);

/** Outcome implied by a stage, so the scorer sets one control, not two. */
export const OUTCOME_FOR_STAGE = Object.freeze({
  none: "not_attempted",
  detect: "not_attempted",
  track: "not_attempted",
  classify: "not_attempted",
  identify: "not_attempted",
  engage: "unsuccessful",
  defeat: "success",
});

/** @returns {number} Position of a stage key, or -1. */
export function stagePosition(key) {
  return STAGES.findIndex((stage) => stage.key === key);
}

/** @returns {boolean} True when the run reached at least the named stage. */
function reached(stageKey, minimum) {
  const position = stagePosition(stageKey);
  return position >= 0 && position >= stagePosition(minimum);
}

/**
 * The stage buttons. Sized and wrapped for a phone held one-handed: the
 * grid reflows to three or four across on a narrow screen and to a single
 * row on a laptop, with no separate mobile layout to keep in step.
 *
 * @param {{ value: string, onChange: (key: string) => void }} props
 */
export function StagePicker({ value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={st.label}>Furthest stage reached</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))",
          gap: 6,
        }}
      >
        {STAGES.map((stage) => (
          <StageButton
            key={stage.key}
            stage={stage}
            active={value === stage.key}
            onSelect={() => onChange(stage.key)}
          />
        ))}
      </div>
      <p style={{ ...st.meta, marginTop: 6 }}>
        One tap sets detection, track, classification, identification, engagement, and
        defeat. Everything below the stage you pick counts as achieved.
      </p>
    </div>
  );
}

/** @returns {JSX.Element} A single stage button. */
function StageButton({ stage, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      style={{
        ...st.outcomeBtn,
        minHeight: 62,
        padding: "6px 4px",
        fontSize: 13,
        gap: 2,
        borderColor: active ? C.orange : C.line,
        color: active ? C.orange : C.inkMuted,
        background: active ? `${C.orange}12` : C.panel,
      }}
    >
      {stage.label}
      <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "none", letterSpacing: 0 }}>
        {stage.hint}
      </span>
    </button>
  );
}

/** @returns {JSX.Element} A compact labelled number input. */
function NumberField({ label, value, onChange }) {
  return (
    <label style={st.field}>
      <span style={st.label}>{label}</span>
      <input
        style={st.input}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** @returns {JSX.Element} A three state yes / no / unanswered control. */
function TriToggle({ label, value, onChange }) {
  const options = [
    { key: "yes", text: "Yes", color: C.success },
    { key: "no", text: "No", color: C.miss },
    { key: "", text: "Not noted", color: C.inkMuted },
  ];
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={st.label}>{label}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {options.map((option) => (
          <button
            key={option.key || "unset"}
            onClick={() => onChange(option.key)}
            style={{
              ...st.outcomeBtn,
              minHeight: 44,
              fontSize: 13,
              borderColor: value === option.key ? option.color : C.line,
              color: value === option.key ? option.color : C.inkMuted,
              background: value === option.key ? `${option.color}12` : C.panel,
            }}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Optional per-run measures, collapsed by default so the fast path stays
 * as fast as it was. Fields appear only once the stage they belong to has
 * been reached.
 *
 * @param {{ form: object, setField: Function, stage: string }} props
 */
export function AdvancedMeasures({ form, setField, stage }) {
  const [open, setOpen] = useState(false);
  if (!reached(stage, "detect")) {
    return null;
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <button style={{ ...st.ghostBtn, width: "100%" }} onClick={() => setOpen(!open)}>
        {open ? "Hide advanced measures" : "Advanced measures (optional)"}
      </button>
      {open ? <MeasureFields form={form} setField={setField} stage={stage} /> : null}
    </div>
  );
}

/** @returns {JSX.Element} The measure inputs relevant to the stage reached. */
function MeasureFields({ form, setField, stage }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={st.grid2}>
        <NumberField
          label="Detect range (m)"
          value={form.detectRangeM}
          onChange={(value) => setField("detectRangeM", value)}
        />
        <NumberField
          label="Detect altitude (m AGL)"
          value={form.detectAltM}
          onChange={(value) => setField("detectAltM", value)}
        />
      </div>
      <p style={{ ...st.meta, marginTop: -6, marginBottom: 12 }}>
        Slant range for MOP 1.1.3 is computed from these two. No third entry needed.
      </p>
      <div style={st.grid2}>
        <NumberField
          label="Time to detect (s)"
          value={form.detectTimeS}
          onChange={(value) => setField("detectTimeS", value)}
        />
        <NumberField
          label="Time to decide / engage (s)"
          value={form.decideTimeS}
          onChange={(value) => setField("decideTimeS", value)}
        />
      </div>
      <p style={{ ...st.meta, marginTop: -6, marginBottom: 12 }}>
        These two phases and the ID and intercept times below build the engagement
        timeline. A phase left blank is reported as not captured, never as zero.
      </p>
      {reached(stage, "track") ? (
        <div style={st.grid2}>
          <NumberField
            label="Track continuity (%)"
            value={form.trackContinuityPct}
            onChange={(value) => setField("trackContinuityPct", value)}
          />
          <NumberField
            label="Track error (m)"
            value={form.trackErrorM}
            onChange={(value) => setField("trackErrorM", value)}
          />
        </div>
      ) : null}
      {reached(stage, "identify") ? (
        <div style={st.grid2}>
          <NumberField
            label="ID range (m)"
            value={form.idRangeM}
            onChange={(value) => setField("idRangeM", value)}
          />
          <NumberField
            label="ID time (s)"
            value={form.idTimeS}
            onChange={(value) => setField("idTimeS", value)}
          />
        </div>
      ) : null}
      {reached(stage, "identify") ? (
        <TriToggle
          label="Identified correctly?"
          value={form.identifiedOk}
          onChange={(value) => setField("identifiedOk", value)}
        />
      ) : null}
    </div>
  );
}
