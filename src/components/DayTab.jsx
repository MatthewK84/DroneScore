import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  closeDay,
  emailWor,
  getCurrentDay,
  listDays,
  openWor,
  reopenDay,
  updateDay,
} from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Field, Loading, Notice } from "./ui.jsx";

/**
 * Day tab. Admins set the location and coordinates that drive weather
 * and sun times, close the day to generate the Warfighter Observation
 * Report, and manage reports from past days.
 */

/** @param {{ isAdmin: boolean }} props */
export function DayTab({ isAdmin }) {
  const [day, setDay] = useState(null);
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState([]);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [current, dayList] = await Promise.all([getCurrentDay(), listDays()]);
      setDay(current.day);
      setStats(current.stats);
      setDays(dayList.days);
      setSettings({
        locationName: current.day.locationName,
        latitude: String(current.day.latitude),
        longitude: String(current.day.longitude),
        weatherNote: current.day.weatherNote,
      });
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load days.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveSettings = useCallback(async () => {
    if (!day) {
      return;
    }
    setStatus("");
    setError("");
    try {
      await updateDay(day.id, {
        locationName: settings.locationName,
        latitude: Number(settings.latitude),
        longitude: Number(settings.longitude),
        weatherNote: settings.weatherNote,
      });
      setStatus("Day settings saved.");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings.");
    }
  }, [day, settings, reload]);

  const done = useCallback(async () => {
    if (!day || busy) {
      return;
    }
    const confirmed = window.confirm(
      "Close the day and generate the Warfighter Observation Report? " +
        "Scoring locks until an admin reopens it."
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const result = await closeDay(day.id);
      setStatus(`Report ${result.controlNumber} generated.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close the day.");
    } finally {
      setBusy(false);
    }
  }, [day, busy, reload]);

  const reopen = useCallback(
    async (id) => {
      try {
        await reopenDay(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to reopen.");
      }
    },
    [reload]
  );

  const sendEmail = useCallback(async (id) => {
    setStatus("");
    setError("");
    try {
      await emailWor(id);
      setStatus("Report emailed to the distribution list.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to email the report.");
    }
  }, []);

  if (loading) {
    return <Loading label="Loading day..." />;
  }

  return (
    <div>
      {status ? <Notice tone="info">{status}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <DaySummary day={day} stats={stats} />

      {isAdmin && settings ? (
        <div style={st.card}>
          <h2 style={st.secHead}>Day Settings</h2>
          <Field label="Location name" value={settings.locationName} onChange={(v) => setSetting("locationName", v)} />
          <div style={st.grid2}>
            <Field label="Latitude" value={settings.latitude} onChange={(v) => setSetting("latitude", v)} type="number" />
            <Field label="Longitude" value={settings.longitude} onChange={(v) => setSetting("longitude", v)} type="number" />
          </div>
          <Field label="Weather note" value={settings.weatherNote} onChange={(v) => setSetting("weatherNote", v)} area />
          <button style={{ ...st.ghostBtn, width: "100%" }} onClick={saveSettings}>Save settings</button>
        </div>
      ) : null}

      {isAdmin ? (
        <div style={st.card}>
          <h2 style={st.secHead}>Close Out</h2>
          {day?.status === "closed" ? (
            <Notice tone="warn">Today is closed. Reopen it below to log more engagements.</Notice>
          ) : (
            <p style={{ fontSize: 14, color: C.inkMuted, marginBottom: 12 }}>
              Closing generates the WOR with results, weather, sun times, location, and scorer notes.
            </p>
          )}
          <button style={{ ...st.doneBtn, opacity: busy || day?.status === "closed" ? 0.5 : 1 }} onClick={done} disabled={busy || day?.status === "closed"}>
            {busy ? "Generating report..." : "Done for the Day"}
          </button>
        </div>
      ) : null}

      <PastDays days={days} isAdmin={isAdmin} onOpen={openWor} onEmail={sendEmail} onReopen={reopen} />
    </div>
  );
}

/** Compact per-interceptor summary for the current day. */
function DaySummary({ day, stats }) {
  const rows = stats?.byInterceptor?.filter((row) => row.attempts > 0) || [];
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Today</h2>
      <div style={{ ...st.meta, marginBottom: 12 }}>
        {day?.date} | {day?.locationName}
      </div>
      {rows.length === 0 ? (
        <p style={st.meta}>No attempted intercepts logged yet.</p>
      ) : (
        rows.map((row) => (
          <div key={row.label} style={st.rowItem}>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{row.label}</strong>
            <span style={st.meta}>
              {row.successes}/{row.attempts} hits | Pk {row.pk === null ? "--" : row.pk.toFixed(2)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** List of prior days with report actions. */
function PastDays({ days, isAdmin, onOpen, onEmail, onReopen }) {
  if (days.length === 0) {
    return null;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Reports</h2>
      {days.map((day) => (
        <div key={day.id} style={st.rowItem}>
          <div>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{day.date}</strong>
            <div style={{ ...st.meta, marginTop: 4 }}>
              {day.engagementCount} engagements
              {day.worControlNumber ? ` | ${day.worControlNumber}` : " | no report yet"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {day.worId ? <button style={st.ghostBtn} onClick={() => onOpen(day.id)}>Open PDF</button> : null}
            {isAdmin && day.worId ? <button style={st.ghostBtn} onClick={() => onEmail(day.id)}>Email</button> : null}
            {isAdmin && day.status === "closed" ? <button style={st.ghostBtn} onClick={() => onReopen(day.id)}>Reopen</button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
