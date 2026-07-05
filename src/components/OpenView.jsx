import { useState } from "react";
import {
  getPublicDay,
  getPublicDays,
  getPublicFeedback,
  getPublicFleet,
  getPublicSchedule,
  openPublicWor,
} from "../api.js";
import { formatDateLong } from "../format.js";
import { usePolledResource } from "../hooks.js";
import { C, MONO, pillStyle, st } from "../styles.js";
import { Loading } from "./ui.jsx";
import { WeatherPanel } from "./WeatherPanel.jsx";

/**
 * Open View. A no-password, read-only mirror of the whole application.
 * It shows the same pages as the scorer and admin views, polls every few
 * seconds so it tracks changes as they happen, and exposes no way to edit.
 */

const POLL_MS = 15000;

const TABS = Object.freeze([
  { key: "conditions", label: "Conditions" },
  { key: "score", label: "Score" },
  { key: "fleet", label: "Fleet" },
  { key: "day", label: "Day" },
  { key: "schedule", label: "Schedule" },
  { key: "feedback", label: "Feedback" },
]);

const OUTCOMES = Object.freeze({
  success: { label: "Success", color: C.success },
  unsuccessful: { label: "Miss", color: C.miss },
  not_attempted: { label: "No Attempt", color: C.noAttempt },
});

/** @returns {string} Pk to two decimals, or a dash. */
function fmtPk(value) {
  return value === null || value === undefined ? "--" : value.toFixed(2);
}

/** @returns {JSX.Element} The read-only body for the active tab. */
function renderTab(activeKey) {
  if (activeKey === "score") {
    return <OpenScore />;
  }
  if (activeKey === "fleet") {
    return <OpenFleet />;
  }
  if (activeKey === "day") {
    return <OpenDay />;
  }
  if (activeKey === "schedule") {
    return <OpenSchedule />;
  }
  if (activeKey === "feedback") {
    return <OpenFeedback />;
  }
  return (
    <div>
      <WeatherPanel />
    </div>
  );
}

/** @param {{ onSignOut: () => void }} props */
export function OpenView({ onSignOut }) {
  const [activeTab, setActiveTab] = useState("conditions");
  return (
    <div style={st.page}>
      <header style={st.header}>
        <div>
          <h1 style={st.brand}>Drone Smoke</h1>
          <div style={st.brandSub}>Open View</div>
        </div>
        <div style={st.roleRow}>
          <span style={pillStyle(C.inkMuted)}>Read Only</span>
          <button style={{ ...st.ghostBtn, minHeight: 40 }} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav style={st.tabBar} className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            style={{ ...st.tab, ...(activeTab === tab.key ? st.tabActive : {}) }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {renderTab(activeTab)}

      <footer style={{ marginTop: 32, fontFamily: MONO, fontSize: 11, color: C.inkMuted, textAlign: "center" }}>
        Read-only view · updates automatically
      </footer>
    </div>
  );
}

/** The live scoreboard and engagement log, read only. */
function OpenScore() {
  const { data, loading } = usePolledResource(getPublicDay, POLL_MS);
  if (loading && !data) {
    return <Loading label="Loading scores..." />;
  }
  return (
    <div>
      <DayStrip day={data?.day} stats={data?.stats} />
      <WeatherPanel />
      <EngagementLog engagements={data?.engagements || []} />
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

/** Read-only engagement log for the current day. */
function EngagementLog({ engagements }) {
  if (engagements.length === 0) {
    return <p style={st.meta}>No engagements logged yet today.</p>;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Engagement Log</h2>
      {engagements.map((engagement) => {
        const outcome = OUTCOMES[engagement.outcome];
        return (
          <div key={engagement.id} style={st.rowItem}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontFamily: MONO, fontSize: 14 }}>{engagement.interceptorName || "Unassigned"}</strong>
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
              {engagement.notes ? <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{engagement.notes}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Read-only fleet listing. */
function OpenFleet() {
  const { data, loading } = usePolledResource(getPublicFleet, POLL_MS);
  if (loading && !data) {
    return <Loading label="Loading fleet..." />;
  }
  const drones = data?.drones || [];
  const interceptors = data?.interceptors || [];
  return (
    <div>
      <div style={st.card}>
        <h2 style={st.secHead}>Target Drones</h2>
        {drones.length === 0 ? (
          <p style={st.meta}>No drones registered.</p>
        ) : (
          drones.map((drone) => (
            <div key={drone.id} style={st.rowItem}>
              <div>
                <strong style={{ fontFamily: MONO, fontSize: 14 }}>{drone.name}</strong>
                <div style={{ ...st.meta, marginTop: 4 }}>
                  {drone.uasGroup ? `Group ${drone.uasGroup}` : "Group N/A"}
                  {drone.airframe ? ` | ${drone.airframe}` : ""}
                  {drone.weightKg !== null ? ` | ${drone.weightKg} kg` : ""}
                  {drone.maxSpeedMs !== null ? ` | ${drone.maxSpeedMs} m/s` : ""}
                </div>
                {drone.notes ? <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{drone.notes}</div> : null}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={st.card}>
        <h2 style={st.secHead}>Interceptors</h2>
        {interceptors.map((interceptor) => (
          <div key={interceptor.id} style={st.rowItem}>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{interceptor.name}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Read-only day summary and report list. */
function OpenDay() {
  const current = usePolledResource(getPublicDay, POLL_MS);
  const history = usePolledResource(getPublicDays, POLL_MS);
  if (current.loading && !current.data) {
    return <Loading label="Loading day..." />;
  }
  const day = current.data?.day;
  const rows = current.data?.stats?.byInterceptor?.filter((row) => row.attempts > 0) || [];
  const days = history.data?.days || [];
  return (
    <div>
      <div style={st.card}>
        <h2 style={st.secHead}>Today</h2>
        <div style={{ ...st.meta, marginBottom: 12 }}>
          {day ? `${day.date} | ${day.locationName}` : "No active day"}
        </div>
        {rows.length === 0 ? (
          <p style={st.meta}>No attempted intercepts logged yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.label} style={st.rowItem}>
              <strong style={{ fontFamily: MONO, fontSize: 14 }}>{row.label}</strong>
              <span style={st.meta}>
                {row.successes}/{row.attempts} hits | Pk {fmtPk(row.pk)}
              </span>
            </div>
          ))
        )}
      </div>
      {days.length > 0 ? (
        <div style={st.card}>
          <h2 style={st.secHead}>Reports</h2>
          {days.map((entry) => (
            <div key={entry.id} style={st.rowItem}>
              <div>
                <strong style={{ fontFamily: MONO, fontSize: 14 }}>{entry.date}</strong>
                <div style={{ ...st.meta, marginTop: 4 }}>
                  {entry.engagementCount} engagements
                  {entry.worControlNumber ? ` | ${entry.worControlNumber}` : " | no report yet"}
                </div>
              </div>
              {entry.worId ? <button style={st.ghostBtn} onClick={() => openPublicWor(entry.id)}>Open PDF</button> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Read-only schedule grouped by date. */
function OpenSchedule() {
  const { data, loading } = usePolledResource(getPublicSchedule, POLL_MS);
  if (loading && !data) {
    return <Loading label="Loading schedule..." />;
  }
  const events = data?.events || [];
  const grouped = groupByDate(events);
  if (grouped.length === 0) {
    return <p style={st.meta}>No events scheduled yet.</p>;
  }
  return (
    <div>
      {grouped.map(([date, dayEvents]) => (
        <div key={date} style={st.card}>
          <h2 style={st.secHead}>{formatDateLong(date)}</h2>
          {dayEvents.map((event) => (
            <div key={event.id} style={st.rowItem}>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 14, color: C.orange, minWidth: 46 }}>{event.timeLabel || "--"}</span>
                <div>
                  <strong style={{ fontSize: 15 }}>{event.title}</strong>
                  {event.details ? <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 3 }}>{event.details}</div> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** @returns {Array<[string, object[]]>} Events bucketed by date. */
function groupByDate(events) {
  const buckets = new Map();
  for (const event of events) {
    const list = buckets.get(event.eventDate) || [];
    list.push(event);
    buckets.set(event.eventDate, list);
  }
  return [...buckets.entries()];
}

/** Read-only feedback list without author identity. */
function OpenFeedback() {
  const { data, loading } = usePolledResource(getPublicFeedback, POLL_MS);
  if (loading && !data) {
    return <Loading label="Loading feedback..." />;
  }
  const entries = data?.entries || [];
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Feedback</h2>
      {entries.length === 0 ? (
        <p style={st.meta}>No feedback yet.</p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} style={st.rowItem}>
            <div>
              <strong style={{ fontSize: 15 }}>{entry.subject}</strong>
              <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{entry.message}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
