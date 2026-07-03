import { C, MONO, st } from "../styles.js";
import { WeatherPanel } from "./WeatherPanel.jsx";

/**
 * Public conditions view. Reachable without signing in, so distinguished
 * visitors and other outside personnel can see range weather and the
 * flying-conditions estimate by drone class. Shows no scores or records.
 */

/** @param {{ onBack: () => void }} props */
export function ConditionsView({ onBack }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px 64px" }}>
      <header style={st.header}>
        <div>
          <h1 style={st.brand}>Drone Smoke</h1>
          <div style={st.brandSub}>Range Flying Conditions</div>
        </div>
        <button style={{ ...st.ghostBtn, minHeight: 40 }} onClick={onBack}>
          Sign in
        </button>
      </header>
      <WeatherPanel />
      <footer style={{ marginTop: 24, fontFamily: MONO, fontSize: 11, color: C.inkMuted, textAlign: "center" }}>
        Public conditions view · updates automatically
      </footer>
    </div>
  );
}
