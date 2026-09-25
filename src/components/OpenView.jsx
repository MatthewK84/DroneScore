import { getPublicDay } from "../api.js";
import { usePolledResource } from "../hooks.js";
import { C, MONO, pillStyle, st } from "../styles.js";
import { CriteriaProgress } from "./CriteriaProgress.jsx";
import { EngagementBoard } from "./EngagementBoard.jsx";
import { Loading } from "./ui.jsx";
import { WeatherPanel } from "./WeatherPanel.jsx";

/**
 * Open View for the viewer role: today's runs on the engagement board, the
 * live range weather, and, at the foot of the page, each interceptor's
 * progress toward JIATF 401 C4 criteria compliance. Each run carries the
 * weather captured at scoring time. No tabs, no fleet, no schedule, no feedback,
 * no reports, and no way to edit anything. Polls so the tally tracks
 * scorer entries in near real time.
 */

const POLL_MS = 15000;

/** @returns {string} Pk to two decimals, or a dash. */
function fmtPk(value) {
  return value === null || value === undefined ? "--" : value.toFixed(2);
}

/**
 * @param {object|null} day
 * @returns {boolean} True when the displayed day is the local calendar date.
 */
function isCurrentDay(day) {
  if (!day || typeof day.date !== "string") {
    return false;
  }
  const localToday = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return day.date === localToday;
}

/** @param {{ onSignOut: () => void }} props */
export function OpenView({ onSignOut }) {
  const { data, loading } = usePolledResource(getPublicDay, POLL_MS);

  return (
    <div style={st.page}>
      <header style={st.header}>
        <div>
          <h1 style={st.brand}>Drone Smoke</h1>
          <div style={st.brandSub}>Score Tally and Criteria Progress</div>
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
          <DayStrip day={data?.day} stats={data?.stats} isToday={isCurrentDay(data?.day)} />
          <Tally engagements={data?.engagements || []} day={data?.day} isToday={isCurrentDay(data?.day)} />
          <WeatherPanel />
          <CriteriaProgress />
        </div>
      )}

      <footer style={{ marginTop: 32, fontFamily: MONO, fontSize: 11, color: C.inkMuted, textAlign: "center" }}>
        Read-only tally · updates automatically
      </footer>
    </div>
  );
}

/** The dark scoreboard summarizing the displayed day. */
function DayStrip({ day, stats, isToday }) {
  const overall = stats?.overall;
  const liveColor = day?.status === "closed" ? C.noAttempt : C.success;
  const statusColor = isToday ? liveColor : "rgba(242,243,238,0.6)";
  const cells = [
    { label: isToday ? "Date" : "Last Activity", value: day ? day.date.slice(5) : "--" },
    { label: "Runs", value: stats ? stats.totalRuns : 0 },
    {
      label: "Intercepts",
      value: overall ? `${overall.successes}/${overall.attempts}` : "0/0",
    },
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
          {day ? (isToday ? day.status : "prior day") : "--"}
        </div>
      </div>
    </div>
  );
}

/** The day's runs on the shared engagement board, or a waiting card before the first. */
function Tally({ engagements, day, isToday }) {
  if (engagements.length === 0) {
    return <EmptyTally day={day} isToday={isToday} />;
  }
  return <EngagementBoard engagements={engagements} />;
}

/** A friendly card shown while the tally has no entries. */
function EmptyTally({ day, isToday }) {
  const detail = isToday
    ? "No data entries have been made yet today."
    : `No data entries have been made today. The last recorded activity was ${day ? day.date : "on a prior day"}.`;
  return (
    <div style={{ ...st.card, textAlign: "center", padding: "34px 18px" }}>
      <h2 style={{ ...st.secHead, marginBottom: 8 }}>Awaiting Scores</h2>
      <p style={{ fontSize: 15, color: C.ink, margin: "0 0 6px" }}>{detail}</p>
      <p style={{ ...st.meta, margin: 0 }}>
        Scored engagements appear here automatically once scoring begins.
      </p>
    </div>
  );
}

