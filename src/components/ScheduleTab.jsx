import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addScheduleEvent,
  ApiError,
  deleteScheduleEvent,
  listSchedule,
} from "../api.js";
import { formatDateLong } from "../format.js";
import { C, MONO, st } from "../styles.js";
import { Field, Loading, Notice } from "./ui.jsx";

/**
 * Schedule tab. Events live in the database so each evaluation window
 * gets its own agenda. Any signed-in user adds events; admins delete.
 */

const EMPTY_EVENT = Object.freeze({ eventDate: "", timeLabel: "", title: "", details: "" });

/** Groups events into date buckets preserving sorted order. */
function groupByDate(events) {
  const buckets = new Map();
  for (const event of events) {
    const list = buckets.get(event.eventDate) || [];
    list.push(event);
    buckets.set(event.eventDate, list);
  }
  return [...buckets.entries()];
}

/** @param {{ isAdmin: boolean }} props */
export function ScheduleTab({ isAdmin }) {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await listSchedule();
      setEvents(data.events);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the schedule.");
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

  const submit = useCallback(async () => {
    if (!form.eventDate || !form.title.trim()) {
      setError("Date and title are required.");
      return;
    }
    try {
      await addScheduleEvent(form);
      setForm(EMPTY_EVENT);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add the event.");
    }
  }, [form, reload]);

  const remove = useCallback(
    async (id) => {
      try {
        await deleteScheduleEvent(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to delete.");
      }
    },
    [reload]
  );

  const grouped = useMemo(() => groupByDate(events), [events]);

  if (loading) {
    return <Loading label="Loading schedule..." />;
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div style={st.card}>
        <h2 style={st.secHead}>Add Event</h2>
        <div style={st.grid2}>
          <Field label="Date" value={form.eventDate} onChange={(v) => setField("eventDate", v)} type="date" />
          <Field label="Time" value={form.timeLabel} onChange={(v) => setField("timeLabel", v)} placeholder="0800" />
        </div>
        <Field label="Title" value={form.title} onChange={(v) => setField("title", v)} placeholder="Range safety brief" />
        <Field label="Details" value={form.details} onChange={(v) => setField("details", v)} area />
        <button style={{ ...st.priBtn, width: "100%" }} onClick={submit}>Add event</button>
      </div>

      {grouped.length === 0 ? (
        <p style={st.meta}>No events scheduled yet.</p>
      ) : (
        grouped.map(([date, dayEvents]) => (
          <div key={date} style={st.card}>
            <h2 style={st.secHead}>{formatDateLong(date)}</h2>
            {dayEvents.map((event) => (
              <div key={event.id} style={st.rowItem}>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 14, color: C.orange, minWidth: 46 }}>
                    {event.timeLabel || "--"}
                  </span>
                  <div>
                    <strong style={{ fontSize: 15 }}>{event.title}</strong>
                    {event.details ? <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 3 }}>{event.details}</div> : null}
                  </div>
                </div>
                {isAdmin ? <button style={st.dangerBtn} onClick={() => remove(event.id)}>Delete</button> : null}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
