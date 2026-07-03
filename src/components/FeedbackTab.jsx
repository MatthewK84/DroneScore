import { useCallback, useEffect, useState } from "react";
import {
  addFeedback,
  ApiError,
  deleteFeedback,
  listFeedback,
  listFullFeedback,
} from "../api.js";
import { C, st } from "../styles.js";
import { Field, Loading, Notice } from "./ui.jsx";

/**
 * Feedback tab. Any signed-in user submits feedback. Admins see the full
 * entries, including author details, and can remove them.
 */

const EMPTY_FEEDBACK = Object.freeze({
  name: "",
  rank: "",
  unit: "",
  subject: "",
  message: "",
});

/** @param {{ isAdmin: boolean }} props */
export function FeedbackTab({ isAdmin }) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(EMPTY_FEEDBACK);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = isAdmin ? await listFullFeedback() : await listFeedback();
      setEntries(data.entries);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load feedback.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.message.trim()) {
      setError("Name, subject, and message are required.");
      return;
    }
    setStatus("");
    setError("");
    try {
      await addFeedback(form);
      setForm(EMPTY_FEEDBACK);
      setStatus("Feedback submitted. Thank you.");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit feedback.");
    }
  }, [form, reload]);

  const remove = useCallback(
    async (id) => {
      try {
        await deleteFeedback(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to delete.");
      }
    },
    [reload]
  );

  if (loading) {
    return <Loading label="Loading feedback..." />;
  }

  return (
    <div>
      {status ? <Notice tone="info">{status}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div style={st.card}>
        <h2 style={st.secHead}>Submit Feedback</h2>
        <div style={st.grid2}>
          <Field label="Name" value={form.name} onChange={(v) => setField("name", v)} />
          <Field label="Rank" value={form.rank} onChange={(v) => setField("rank", v)} />
        </div>
        <Field label="Unit" value={form.unit} onChange={(v) => setField("unit", v)} />
        <Field label="Subject" value={form.subject} onChange={(v) => setField("subject", v)} />
        <Field label="Message" value={form.message} onChange={(v) => setField("message", v)} area />
        <button style={{ ...st.priBtn, width: "100%" }} onClick={submit}>Submit feedback</button>
      </div>

      <div style={st.card}>
        <h2 style={st.secHead}>{isAdmin ? "All Feedback" : "Recent Feedback"}</h2>
        {entries.length === 0 ? (
          <p style={st.meta}>No feedback yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} style={st.rowItem}>
              <div>
                <strong style={{ fontSize: 15 }}>{entry.subject}</strong>
                {isAdmin ? (
                  <div style={{ ...st.meta, marginTop: 3 }}>
                    {entry.name}
                    {entry.rank ? `, ${entry.rank}` : ""}
                    {entry.unit ? ` | ${entry.unit}` : ""}
                  </div>
                ) : null}
                <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{entry.message}</div>
              </div>
              {isAdmin ? <button style={st.dangerBtn} onClick={() => remove(entry.id)}>Delete</button> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
