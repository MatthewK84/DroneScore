import { useCallback, useState } from "react";
import { ApiError, login } from "../api.js";
import { C, DISPLAY, MONO, st } from "../styles.js";

/**
 * Login screen. One password field: the server maps a scorer password
 * or an admin password to the matching role, so no role picker is shown.
 */

/** @param {{ onAuthed: (role: string) => void, onViewPublic: () => void }} props */
export function Login({ onAuthed, onViewPublic }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!password || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await login(password);
      onAuthed(result.role);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Sign in failed.";
      setError(message);
      setBusy(false);
    }
  }, [password, busy, onAuthed]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        submit();
      }
    },
    [submit]
  );

  return (
    <div style={{ maxWidth: 380, margin: "12vh auto 0", padding: "0 16px" }}>
      <h1 style={{ ...st.brand, fontSize: 40 }}>Drone Smoke</h1>
      <p style={{ fontFamily: MONO, fontSize: 12, color: C.inkMuted, margin: "6px 0 24px" }}>
        C-sUAS Interceptor Evaluation
      </p>
      <div style={st.card}>
        <label style={st.field}>
          <span style={st.label}>Access password</span>
          <input
            style={st.input}
            type="password"
            value={password}
            autoFocus
            placeholder="Enter scorer or admin password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <button
          style={{ ...st.priBtn, width: "100%", opacity: busy ? 0.6 : 1 }}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Signing in" : "Sign in"}
        </button>
        {error ? <p style={st.error}>{error}</p> : null}
      </div>
      <p style={{ fontFamily: DISPLAY, fontSize: 13, color: C.inkMuted, letterSpacing: "0.04em" }}>
        Scorers log engagements. Admins edit records and close the day.
      </p>
      <button
        style={{ ...st.ghostBtn, width: "100%", marginTop: 8 }}
        onClick={onViewPublic}
      >
        View current flying conditions
      </button>
    </div>
  );
}
