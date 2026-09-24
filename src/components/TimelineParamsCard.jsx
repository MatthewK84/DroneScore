import { C, MONO, st } from "../styles.js";
import { PHASES, phaseSum } from "../preset-logic.js";

/**
 * Parameters for the timeline-budget presets. Every field feeds the
 * preview live; nothing is stored until an apply button is clicked.
 */

const SHARED_FIELDS = Object.freeze([
  { key: "standoffM", label: "Standoff (m)" },
  { key: "missionHours", label: "Mission hours" },
  { key: "shotsPerTarget", label: "Shots per target" },
  { key: "maxTrackMoveM", label: "Max track move (m)" },
  { key: "threatUnitCostUsd", label: "Threat unit cost ($, optional)" },
]);

const LEVEL_FIELDS = Object.freeze([
  { key: "timelineS", label: "Timeline (s)" },
  { key: "designSpeedMph", label: "Design speed (mph)" },
  { key: "simultaneousTargets", label: "Simultaneous targets" },
  { key: "sequentialTargetsPerEffector", label: "Sequential targets per effector" },
  { key: "noAbortProbability", label: "No-abort probability" },
  { key: "costExchangeRatio", label: "Cost exchange ratio" },
]);

const PAYLOAD_LABELS = Object.freeze({
  ew_takeover: "EW takeover",
  rf_narrowband: "Narrowband RF",
  laser: "Laser",
  directed_energy: "Directed energy",
  kinetic: "Kinetic",
});

const UAS_GROUPS = Object.freeze(["1", "2", "3", "4", "5"]);

const FIT_GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };

/** @returns {string} A form value as input text. */
function asInput(value) {
  return value === null || value === undefined ? "" : String(value);
}

/** One numeric input. */
function NumberField({ label, value, onChange }) {
  return (
    <label style={st.field}>
      <span style={st.label}>{label}</span>
      <input style={st.input} type="number" inputMode="decimal" value={asInput(value)} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** The live check that a level's phases add up to its timeline. */
function PhaseCheck({ level }) {
  const sum = phaseSum(level);
  const timeline = Number.parseFloat(level.timelineS);
  const ok = sum !== null && sum === timeline;
  const text = sum === null ? "Enter every phase budget." : `Phases sum to ${sum} s of ${asInput(level.timelineS)} s.`;
  return <p style={{ ...st.meta, color: ok ? C.success : C.miss, marginTop: -4, marginBottom: 12 }}>{text}</p>;
}

/** The fields for one level: Threshold or Objective. */
function LevelFields({ name, title, level, onLevel, onPhase }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
      <h3 style={{ ...st.label, fontSize: 15, color: C.olive }}>{title}</h3>
      <label style={st.field}>
        <span style={st.label}>Design threat</span>
        <input style={st.input} value={asInput(level.designThreat)} onChange={(e) => onLevel(name, "designThreat", e.target.value)} />
      </label>
      <label style={st.field}>
        <span style={st.label}>UAS group</span>
        <select style={st.input} value={asInput(level.uasGroup)} onChange={(e) => onLevel(name, "uasGroup", e.target.value)}>
          {UAS_GROUPS.map((group) => (
            <option key={group} value={group}>
              Group {group}
            </option>
          ))}
        </select>
      </label>
      <div style={FIT_GRID}>
        {LEVEL_FIELDS.map((field) => (
          <NumberField key={field.key} label={field.label} value={level[field.key]} onChange={(value) => onLevel(name, field.key, value)} />
        ))}
      </div>
      <span style={st.label}>Phase budgets (s)</span>
      <div style={{ ...FIT_GRID, gridTemplateColumns: "repeat(3, 1fr)" }}>
        {PHASES.map((phase) => (
          <NumberField key={phase} label={phase} value={level.phases[phase]} onChange={(value) => onPhase(name, phase, value)} />
        ))}
      </div>
      <PhaseCheck level={level} />
    </div>
  );
}

/** Toggle buttons for the defeat payloads the system carries. */
function PayloadPicker({ payloadTypes, selected, onToggle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={st.label}>Defeat payloads carried</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {payloadTypes.map((type) => {
          const on = selected.includes(type);
          return (
            <button
              key={type}
              aria-pressed={on}
              onClick={() => onToggle(type)}
              style={{ ...st.ghostBtn, borderColor: on ? C.olive : C.line, color: on ? C.olive : C.inkMuted, background: on ? C.oliveSoft : C.panel }}
            >
              {PAYLOAD_LABELS[type] || type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Which system the presets are written against. */
function ScopePicker({ interceptors, scope, onScope }) {
  return (
    <label style={st.field}>
      <span style={st.label}>Write benchmarks for</span>
      <select style={st.input} value={scope} onChange={(e) => onScope(e.target.value)}>
        <option value="">All systems</option>
        {interceptors.map((entry) => (
          <option key={entry.id} value={String(entry.id)}>
            {entry.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * @param {{ form: object | null, onLoadDefaults: () => void, onShared: Function,
 *   onLevel: Function, onPhase: Function, payloadTypes: string[], payloads: string[],
 *   onTogglePayload: Function, interceptors: object[], scope: string, onScope: Function }} props
 */
export function TimelineParamsCard(props) {
  const { form, onLoadDefaults, onShared, onLevel, onPhase } = props;
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Timeline Budget (C4 ETA)</h2>
      <p style={{ ...st.meta, marginBottom: 12 }}>
        Presets come from a detect-to-defeat budget. The Threshold budget is sized against the MLCOA threat. The
        Objective budget is sized against the MDCOA threat.
      </p>
      <button style={{ ...st.priBtn, width: "100%", marginBottom: 14 }} onClick={onLoadDefaults}>
        Load C4 60/180 defaults
      </button>
      {form === null ? null : (
        <>
          <div style={FIT_GRID}>
            {SHARED_FIELDS.map((field) => (
              <NumberField key={field.key} label={field.label} value={form[field.key]} onChange={(value) => onShared(field.key, value)} />
            ))}
          </div>
          <PayloadPicker payloadTypes={props.payloadTypes} selected={props.payloads} onToggle={props.onTogglePayload} />
          <ScopePicker interceptors={props.interceptors} scope={props.scope} onScope={props.onScope} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            <LevelFields name="threshold" title="Threshold" level={form.threshold} onLevel={onLevel} onPhase={onPhase} />
            <LevelFields name="objective" title="Objective" level={form.objective} onLevel={onLevel} onPhase={onPhase} />
          </div>
        </>
      )}
      <p style={{ ...st.meta, fontFamily: MONO, marginTop: 10 }}>Nothing is stored until you click an apply button.</p>
    </div>
  );
}
