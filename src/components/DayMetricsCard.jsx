import { st } from "../styles.js";

/**
 * Operational-day measures. Four of the framework's MOPs cannot be derived
 * from any single run, because they are properties of the day as a whole:
 * false alarms accumulate over operating time, and a system abort is an
 * event between runs rather than within one.
 *
 * These are the only fields the framework adds to a scorer's day, and they
 * are entered once at closeout rather than being asked per run.
 */

const FIELDS = Object.freeze([
  { key: "operatingMinutes", label: "Operating time (min)", hint: "Powered and available, feeding MOP 1.1.4 and MOP 4.2.1." },
  { key: "falseAlarms", label: "False sUAS detections", hint: "MOP 1.1.4 false alarm rate, per operating hour." },
  { key: "systemAborts", label: "System aborts", hint: "Critical failures that halted the mission, MOP 4.2.1." },
  { key: "repairMinutes", label: "Repair time (min)", hint: "Diagnose and repair only, excluding admin and logistics delay, MOP 4.2.2." },
  { key: "operateCrew", label: "Crew to operate (# ppl)", hint: "KPP 6.1 workload." },
  { key: "setupCrew", label: "Crew to set up (# ppl)", hint: "KPP 6.3 workload." },
  { key: "setupMinutes", label: "Setup time (min)", hint: "Recorded alongside setup crew size." },
]);

/** @returns {string} A stored value rendered for an input. */
function inputValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * @param {{ metrics: object, onChange: Function, onSave: Function }} props
 */
export function DayMetricsCard({ metrics, onChange, onSave }) {
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Day Measures</h2>
      <p style={{ ...st.meta, marginBottom: 14 }}>
        Four MOPs are properties of the day rather than of any run. Left blank they print
        as not entered on the report, never as zero, because a zero false alarm rate that
        nobody counted is a claim and not a measurement.
      </p>
      {FIELDS.map((field) => (
        <label key={field.key} style={st.field}>
          <span style={st.label}>{field.label}</span>
          <p style={{ ...st.meta, marginTop: 0, marginBottom: 6 }}>{field.hint}</p>
          <input
            style={st.input}
            type="number"
            inputMode="decimal"
            value={inputValue(metrics[field.key])}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        </label>
      ))}
      <label style={st.field}>
        <span style={st.label}>Sensor source</span>
        <p style={{ ...st.meta, marginTop: 0, marginBottom: 6 }}>
          Note when a separate radar or EO/IR fed the engagement rather than the onboard
          optic, so detection and track results are attributed to the right sensor.
        </p>
        <input
          style={st.input}
          value={inputValue(metrics.sensorSource)}
          placeholder="Operator in the loop through the interceptor optic"
          onChange={(event) => onChange("sensorSource", event.target.value)}
        />
      </label>
      <button style={{ ...st.ghostBtn, width: "100%" }} onClick={onSave}>
        Save day measures
      </button>
    </div>
  );
}
