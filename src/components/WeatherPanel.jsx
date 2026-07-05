import { useCallback, useEffect, useState } from "react";
import { ApiError, getConditions } from "../api.js";
import { C, DISPLAY, MONO, pillStyle, st } from "../styles.js";

/**
 * Live weather and flying-conditions panel. Fetches the public conditions
 * endpoint, refreshes on an interval, and renders current weather plus a
 * GO / CAUTION / NO-GO rating per UAS group. Used by the score tab and the
 * public conditions view so both always show the same data.
 */

const REFRESH_MS = 5 * 60 * 1000;

const RATING_COLOR = Object.freeze({
  "GO": C.success,
  "CAUTION": C.noAttempt,
  "NO-FLY": C.miss,
  "UNKNOWN": C.inkMuted,
});

/** @returns {string} A metric value with a unit, or a dash when absent. */
function metric(value, unit) {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${value}${unit}`;
}

/** @returns {string} Short local time from an ISO timestamp, or "". */
function observedTime(iso) {
  if (typeof iso !== "string") {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function WeatherPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await getConditions();
      setData((prev) => {
        if (!result.weather && prev?.weather) {
          return { ...prev, stale: true, generatedAt: result.generatedAt };
        }
        return result;
      });
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load weather.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading) {
    return (
      <div style={st.card}>
        <p style={st.meta}>Loading conditions...</p>
      </div>
    );
  }

  return (
    <div style={st.card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ ...st.secHead, margin: 0 }}>Range Weather</h2>
        <button style={{ ...st.ghostBtn, minHeight: 36, padding: "4px 12px" }} onClick={load}>
          Refresh
        </button>
      </div>
      {data?.location ? <div style={{ ...st.meta, margin: "6px 0 12px" }}>{data.location}</div> : null}
      {error ? <p style={st.error}>{error}</p> : null}
      <WeatherMetrics weather={data?.weather} stale={data?.stale} />
      <ConditionsTable assessments={data?.assessments || []} />
      <p style={{ ...st.meta, marginTop: 10, fontSize: 11 }}>
        Ratings apply DoD Group thresholds for wind (mph), visibility (SM), and temperature (F),
        using the greater of sustained and gust wind. Confirm against local range rules before
        flight.
      </p>
    </div>
  );
}

/** The current observation grid. */
function WeatherMetrics({ weather, stale }) {
  if (!weather) {
    return (
      <div style={{ ...st.notice, color: C.noAttempt, background: "#FBF3DC", marginTop: 12 }}>
        Live weather is unavailable right now. Group ratings show as unknown until it returns.
      </div>
    );
  }
  const cells = [
    { label: "Temp", value: `${metric(weather.tempF, " F")}` },
    { label: "Wind", value: metric(weather.windMph, " mph") },
    { label: "Gust", value: metric(weather.gustMph, " mph") },
    { label: "Visibility", value: metric(weather.visibilitySM, " SM") },
    { label: "Humidity", value: metric(weather.humidityPct, " %") },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 8, marginBottom: 10 }}>
        {cells.map((cell) => (
          <div key={cell.label} style={{ background: C.oliveSoft, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.inkMuted }}>
              {cell.label}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 18, color: C.ink }}>{cell.value}</div>
          </div>
        ))}
      </div>
      <div style={st.meta}>
        {weather.description || "No description"}
        {weather.observedAt ? ` · observed ${observedTime(weather.observedAt)}` : ""}
        {stale ? <span style={{ ...pillStyle(C.noAttempt), marginLeft: 8, padding: "1px 8px", fontSize: 10 }}>Last known</span> : null}
      </div>
    </div>
  );
}

/** The per-group flying-conditions table. */
function ConditionsTable({ assessments }) {
  if (assessments.length === 0) {
    return null;
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase", color: C.inkMuted, marginBottom: 8 }}>
        Flying conditions by class
      </div>
      {assessments.map((row) => (
        <div key={row.group} style={{ ...st.rowItem, alignItems: "center" }}>
          <div>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{row.label}</strong>
            <span style={{ ...st.meta, marginLeft: 8 }}>{row.detail}</span>
            <div style={{ ...st.meta, marginTop: 3 }}>{row.drivers.join(" · ")}</div>
          </div>
          <span style={pillStyle(RATING_COLOR[row.rating] || C.inkMuted)}>{row.rating}</span>
        </div>
      ))}
    </div>
  );
}
