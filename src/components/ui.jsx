import { C, st } from "../styles.js";

/**
 * Shared presentational components. Pure functions of their props with
 * no state, so every tab can compose them without duplication.
 */

/** A labeled text input, textarea, or select. */
export function Field(props) {
  const { label, value, onChange, placeholder, type, area, options } = props;
  return (
    <label style={st.field}>
      <span style={st.label}>{label}</span>
      {renderControl({ value, onChange, placeholder, type, area, options })}
    </label>
  );
}

/** @returns {JSX.Element} The control matching the field configuration. */
function renderControl(props) {
  const { value, onChange, placeholder, type, area, options } = props;
  if (Array.isArray(options)) {
    return (
      <select style={st.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (area) {
    return (
      <textarea
        style={{ ...st.input, minHeight: 96, resize: "vertical", paddingTop: 10 }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      style={st.input}
      type={type || "text"}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A colored inline notice banner. */
export function Notice({ tone, children }) {
  const palette = {
    info: { color: C.olive, background: C.oliveSoft },
    warn: { color: C.noAttempt, background: "#FBF3DC" },
    error: { color: C.miss, background: "#FBE6E4" },
  };
  const chosen = palette[tone] || palette.info;
  return (
    <div style={{ ...st.notice, color: chosen.color, background: chosen.background }}>
      {children}
    </div>
  );
}

/** A short muted loading line. */
export function Loading({ label }) {
  return <p style={st.meta}>{label || "Loading..."}</p>;
}
