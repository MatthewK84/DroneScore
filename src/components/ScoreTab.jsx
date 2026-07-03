import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEngagement,
  ApiError,
  deleteEngagement,
  getCurrentDay,
  listDrones,
  listInterceptors,
  updateEngagement,
} from "../api.js";
import { useStopwatch } from "../hooks.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";
import { WeatherPanel } from "./WeatherPanel.jsx";

/**
 * Score tab. Shows the live scoreboard for today, a large touch-friendly
 * engagement form with a built-in stopwatch, and the day's engagement log.
 */

const OUTCOMES = Object.freeze([
  { value: "success", label: "Success", color: C.success },
  { value: "unsuccessful", label: "Miss", color: C.miss },
  { value: "not_attempted", label: "No Attempt", color: C.noAttempt },
]);

const EMPTY_FORM = Object.freeze({
  sortie: "",
  droneId: "",
  interceptorId: "",
  outcome: "success",
  timeToInterceptS: "",
  engagementRangeM: "",
  altitudeM: "",
  notes: "",
});

/** @returns {object} Payload with blank numeric fields converted to null. */
function toPayload(form) {
  const asNumber = (value) => (value === "" ? null : Number(value));
  return {
    sortie: form.sortie,
    droneId: form.droneId === "" ? null : Number(form.droneId),
    interceptorId: form.interceptorId === "" ? null : Number(form.interceptorId),
    outcome: form.outcome,
    timeToInterceptS: asNumber(form.timeToInterceptS),
    engagementRangeM: asNumber(form.engagementRangeM),
    altitudeM: asNumber(form.altitudeM),
    notes: form.notes,
  };
}

/** @param {{ isAdmin: boolean }} props */
export function ScoreTab({ isAdmin }) {
  const [day, setDay] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [stats, setStats] = useState(null);
  const [drones, setDrones] = useState([]);
  const [interceptors, setInterceptors] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const stopwatch = useStopwatch();

  const reload = useCallback(async () => {
    try {
      const [dayData, droneData, interceptorData] = await Promise.all([
        getCurrentDay(),
        listDrones(),
        listInterceptors(),
      ]);
      setDay(dayData.day);
      setEngagements(dayData.engagements);
      setStats(dayData.stats);
      setDrones(droneData.drones);
      setInterceptors(interceptorData.interceptors);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the day.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    stopwatch.reset();
  }, [stopwatch]);

  const submit = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = toPayload(form);
      if (editingId === null) {
        await addEngagement(payload);
      } else {
        await updateEngagement(editingId, payload);
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the engagement.");
    } finally {
      setBusy(false);
    }
  }, [busy, form, editingId, resetForm, reload]);

  const beginEdit = useCallback((engagement) => {
    setEditingId(engagement.id);
    setForm({
      sortie: engagement.sortie || "",
      droneId: engagement.droneId === null ? "" : String(engagement.droneId),
      interceptorId: engagement.interceptorId === null ? "" : String(engagement.interceptorId),
      outcome: engagement.outcome,
      timeToInterceptS: engagement.timeToInterceptS === null ? "" : String(engagement.timeToInterceptS),
      engagementRangeM: engagement.engagementRangeM === null ? "" : String(engagement.engagementRangeM),
      altitudeM: engagement.altitudeM === null ? "" : String(engagement.altitudeM),
      notes: engagement.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const remove = useCallback(
    async (id) => {
      if (!window.confirm("Delete this engagement?")) {
        return;
      }
      try {
        await deleteEngagement(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to delete.");
      }
    },
    [reload]
  );

  const useStopwatchValue = useCallback(() => {
    stopwatch.stop();
    setField("timeToInterceptS", String(stopwatch.seconds));
  }, [stopwatch, setField]);

  const closed = day?.status === "closed";

  if (loading) {
    return <Loading label="Loading today..." />;
  }

  return (
    <div>
      <DayStrip day={day} stats={stats} />
      <WeatherPanel />
      {closed ? (
        <Notice tone="warn">
          Today is closed and the report is generated. An admin can reopen it from the Day tab to
          log more engagements.
        </Notice>
      ) : (
        <EngagementForm
          form={form}
          setField={setField}
          drones={drones}
          interceptors={interceptors}
          editingId={editingId}
          busy={busy}
          stopwatch={stopwatch}
          onUseStopwatch={useStopwatchValue}
          onSubmit={submit}
          onCancel={resetForm}
        />
      )}
      {error ? <p style={st.error}>{error}</p> : null}
      <EngagementLog
        engagements={engagements}
        isAdmin={isAdmin}
        onEdit={beginEdit}
        onDelete={remove}
      />
    </div>
  );
}

/** The dark scoreboard summarizing the current day. */
function DayStrip({ day, stats }) {
  const overall = stats?.overall;
  const pk = overall && overall.pk !== null ? overall.pk.toFixed(2) : "--";
  const statusColor = day?.status === "closed" ? C.noAttempt : C.success;
  const cells = [
    { label: "Date", value: day ? day.date.slice(5) : "--" },
    { label: "Logged", value: overall ? overall.total : 0 },
    { label: "Hits", value: overall ? overall.successes : 0 },
    { label: "Pk", value: pk },
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
          {day?.status || "open"}
        </div>
      </div>
    </div>
  );
}

/** The engagement entry form with the big outcome selector and stopwatch. */
function EngagementForm(props) {
  const { form, setField, drones, interceptors, editingId, busy, stopwatch } = props;
  const { onUseStopwatch, onSubmit, onCancel } = props;
  const droneOptions = useMemo(
    () => [{ id: "", name: "Select target drone" }, ...drones],
    [drones]
  );
  const interceptorOptions = useMemo(
    () => [{ id: "", name: "Select interceptor" }, ...interceptors],
    [interceptors]
  );
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>{editingId === null ? "Log Engagement" : "Edit Engagement"}</h2>
      {drones.length === 0 ? (
        <Notice tone="info">Add target drones in the Fleet tab before scoring.</Notice>
      ) : null}
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Sortie</span>
          <input style={st.input} value={form.sortie} placeholder="DS-01" onChange={(e) => setField("sortie", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>Target drone</span>
          <select style={st.input} value={form.droneId} onChange={(e) => setField("droneId", e.target.value)}>
            {droneOptions.map((drone) => (
              <option key={drone.id || "none"} value={drone.id}>
                {drone.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={st.field}>
        <span style={st.label}>Interceptor</span>
        <select style={st.input} value={form.interceptorId} onChange={(e) => setField("interceptorId", e.target.value)}>
          {interceptorOptions.map((interceptor) => (
            <option key={interceptor.id || "none"} value={interceptor.id}>
              {interceptor.name}
            </option>
          ))}
        </select>
      </label>
      <span style={st.label}>Outcome</span>
      <div style={{ ...st.outcomeRow, marginBottom: 14 }}>
        {OUTCOMES.map((option) => {
          const active = form.outcome === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setField("outcome", option.value)}
              style={{
                ...st.outcomeBtn,
                borderColor: active ? option.color : C.line,
                color: active ? option.color : C.inkMuted,
                background: active ? `${option.color}12` : C.panel,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <Stopwatch stopwatch={stopwatch} onUse={onUseStopwatch} />
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Time to intercept (s)</span>
          <input style={st.input} type="number" inputMode="decimal" value={form.timeToInterceptS} onChange={(e) => setField("timeToInterceptS", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>Range (m)</span>
          <input style={st.input} type="number" inputMode="decimal" value={form.engagementRangeM} onChange={(e) => setField("engagementRangeM", e.target.value)} />
        </label>
      </div>
      <label style={st.field}>
        <span style={st.label}>Altitude (m)</span>
        <input style={st.input} type="number" inputMode="decimal" value={form.altitudeM} onChange={(e) => setField("altitudeM", e.target.value)} />
      </label>
      <label style={st.field}>
        <span style={st.label}>Notes</span>
        <textarea style={{ ...st.input, minHeight: 84, resize: "vertical", paddingTop: 10 }} value={form.notes} placeholder="Observed behavior, conditions, recommendations" onChange={(e) => setField("notes", e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <button style={{ ...st.priBtn, flex: 1, opacity: busy ? 0.6 : 1 }} onClick={onSubmit} disabled={busy}>
          {editingId === null ? "Log engagement" : "Save changes"}
        </button>
        {editingId === null ? null : (
          <button style={st.ghostBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** The stopwatch control that feeds the time to intercept field. */
function Stopwatch({ stopwatch, onUse }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 26, color: stopwatch.running ? C.success : C.ink, minWidth: 74 }}>
        {stopwatch.seconds}s
      </span>
      {stopwatch.running ? (
        <button style={st.ghostBtn} onClick={stopwatch.stop}>Stop</button>
      ) : (
        <button style={st.ghostBtn} onClick={stopwatch.start}>Start</button>
      )}
      <button style={st.ghostBtn} onClick={onUse}>Use as TTI</button>
      <button style={st.ghostBtn} onClick={stopwatch.reset}>Reset</button>
    </div>
  );
}

/** The scrollable log of engagements for the current day. */
function EngagementLog({ engagements, isAdmin, onEdit, onDelete }) {
  if (engagements.length === 0) {
    return <p style={st.meta}>No engagements logged yet today.</p>;
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Engagement Log</h2>
      {engagements.map((engagement) => (
        <EngagementRow
          key={engagement.id}
          engagement={engagement}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

/** A single engagement line with outcome color and admin controls. */
function EngagementRow({ engagement, isAdmin, onEdit, onDelete }) {
  const outcome = OUTCOMES.find((option) => option.value === engagement.outcome);
  return (
    <div style={st.rowItem}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
        {engagement.notes ? (
          <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{engagement.notes}</div>
        ) : null}
      </div>
      {isAdmin ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button style={st.ghostBtn} onClick={() => onEdit(engagement)}>Edit</button>
          <button style={st.dangerBtn} onClick={() => onDelete(engagement.id)}>Delete</button>
        </div>
      ) : null}
    </div>
  );
}
