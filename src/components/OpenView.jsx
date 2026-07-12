import { getPublicDay } from "../api.js";
import { usePolledResource } from "../hooks.js";
import { C, MONO, pillStyle, st } from "../styles.js";
import { Loading } from "./ui.jsx";
import { WeatherPanel } from "./WeatherPanel.jsx";

/**
 * Open View for the viewer role: a single running tally sheet. It shows
 * the live range weather and today's scored items, each with the weather
 * captured at scoring time. No tabs, no fleet, no schedule, no feedback,
 * no reports, and no way to edit anything. Polls so the tally tracks
 * scorer entries in near real time.
 */

const POLL_MS = 15000;

const OUTCOMES = Object.freeze({
  success: { label: "Success", color: C.success },
  unsuccessful: { label: "Miss", color: C.miss },
  not_attempted: { label: "No Attempt", color: C.noAttempt },
});

/** @returns {string} Pk to two decimals, or a dash. */
function fmtPk(value) {
  return value === null || value === undefined ? "--" : value.toFixed(2);
}

/** @returns {string} Local HH:MM from a timestamp, or "". */
function shortTime(iso) {
  if (typeof iso !== "string") {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** @returns {string} Compact weather line for one scored item, or "". */
function weatherLine(weather) {
  if (!weather) {
    return "";
  }
  const parts = [];
  if (typeof weather.tempF === "number") {
    parts.push(`${weather.tempF} F`);
  }
  if (typeof weather.windMph === "number") {
    const gust = typeof weather.gustMph === "number" ? ` G${weather.gustMph}` : "";
    parts.push(`wind ${weather.windMph}${gust} mph`);
  }
  if (weather.description) {
    parts.push(weather.description);
  }
  return parts.join(" · ");
}

/** @param {{ onSignOut: () => void }} props */
export function OpenView({ onSignOut }) {
  const { data, loading } = usePolledResource(getPublicDay, POLL_MS);

  return (
    <div style={st.page}>
      <header style={st.header}>
        <div>
          <h1 style={st.brand}>Drone Smoke</h1>
          <div style={st.brandSub}>Score Tally</div>
        </div>
        <div style={st.roleRow}>
          <span style={pillStyle(C.inkMuted)}>Read Only</span>
          <button style={{ ...st.ghostBtn, minHeight: 40 }} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {loading && !data ? (
        <Loading label="Loading tally..." />
      ) : (
        <div>
          <DayStrip day={data?.day} stats={data?.stats} />
          <WeatherPanel />
          <TallySheet engagements={data?.engagements || []} />
        </div>
      )}

      <footer style={{ marginTop: 32, fontFamily: MONO, fontSize: 11, color: C.inkMuted, textAlign: "center" }}>
        Read-only tally · updates automatically
      </footer>
    </div>
  );
}

/** The dark scoreboard summarizing the current day. */
function DayStrip({ day, stats }) {
  const overall = stats?.overall;
  const statusColor = day?.status === "closed" ? C.noAttempt : C.success;
  const cells = [
    { label: "Date", value: day ? day.date.slice(5) : "--" },
    { label: "Logged", value: overall ? overall.total : 0 },
    { label: "Hits", value: overall ? overall.successes : 0 },
    { label: "Pk", value: overall ? fmtPk(overall.pk) : "--" },
  ];
  return (
    <div style={st.strip}>
      {cells.map((cell) => (
        <div key={cell.label} style={st.stripCell}>
          <div style={st.stripLabel}>{cell.label}</div>
          <div style={st.stripValue}>{cell.value}</div>
        </div>
      ))}
      <div style={{ ...st.stripCell, borderRight: "none", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
        <div style={st.stripLabel}>Status</div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, color: statusColor, textTransform: "uppercase" }}>
          {day?.status || "--"}
        </div>
      </div>
    </div>
  );
}

/** The running tally of scored items, weather at time of score included. */
function TallySheet({ engagements }) {
  if (engagements.length === 0) {
    return <p style={st.meta}>No engagements scored yet today.</p>;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Scored Items</h2>
      {engagements.map((engagement) => (
        <TallyRow key={engagement.id} engagement={engagement} />
      ))}
    </div>
  );
}

/** One scored item with outcome, metrics, and its weather snapshot. */
function TallyRow({ engagement }) {
  const outcome = OUTCOMES[engagement.outcome];
  const wx = weatherLine(engagement.weather);
  return (
    <div style={st.rowItem}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.inkMuted }}>
            {shortTime(engagement.occurredAt)}
          </span>
          <strong style={{ fontFamily: MONO, fontSize: 14 }}>
            {engagement.interceptorName || "Unassigned"}
          </strong>
          <span style={st.meta}>vs {engagement.droneName || "Unassigned"}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: outcome?.color || C.inkMuted, textTransform: "uppercase" }}>
            {outcome?.label || engagement.outcome}
          </span>
        </div>
        <div style={{ ...st.meta, marginTop: 4 }}>
          {engagement.sortie ? `${engagement.sortie} | ` : ""}
          {engagement.timeToInterceptS !== null ? `${engagement.timeToInterceptS}s | ` : ""}
          {engagement.engagementRangeM !== null ? `${engagement.engagementRangeM}m` : ""}
        </div>
        {wx ? (
          <div style={{ ...st.meta, marginTop: 3, color: C.olive }}>{wx}</div>
        ) : null}
      </div>
    </div>
  );
}
