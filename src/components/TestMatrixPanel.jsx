import { useCallback, useEffect, useState } from "react";
import { addTestProfile, ApiError, deleteTestProfile, listTestProfiles } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";

/**
 * Test matrix. Each profile is one block of the evaluation team's matrix:
 * a mission type flown at a time of day for a required number of data
 * points, with one or more target lines beneath it carrying their own
 * altitude, speed, and launch point.
 *
 * A multi-target profile stays a single profile rather than three, because
 * the matrix defines those targets as flying concurrently. Splitting them
 * would triple the required data points and misreport coverage.
 */

const EMPTY_PROFILE = Object.freeze({
  code: "",
  mission: "",
  timeOfDay: "Day",
  dataPointsRequired: "3",
  notes: "",
});

const EMPTY_TARGET = Object.freeze({
  targetName: "",
  elevationFtAgl: "",
  speedMph: "",
  launchPoint: "",
});

/** @returns {object} A target line with blanks converted to null. */
function targetToPayload(target) {
  const asNumber = (value) => (value === "" ? null : Number(value));
  return {
    targetName: target.targetName,
    elevationFtAgl: asNumber(target.elevationFtAgl),
    speedMph: asNumber(target.speedMph),
    launchPoint: target.launchPoint,
  };
}

/** @param {{ isAdmin: boolean }} props */
export function TestMatrixPanel({ isAdmin }) {
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [targets, setTargets] = useState([{ ...EMPTY_TARGET }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await listTestProfiles();
      setProfiles(data.profiles);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the test matrix.");
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

  const setTarget = useCallback((index, key, value) => {
    setTargets((prev) => prev.map((target, position) => (position === index ? { ...target, [key]: value } : target)));
  }, []);

  const addTargetLine = useCallback(() => {
    setTargets((prev) => (prev.length >= 6 ? prev : [...prev, { ...EMPTY_TARGET }]));
  }, []);

  const removeTargetLine = useCallback((index) => {
    setTargets((prev) => (prev.length <= 1 ? prev : prev.filter((_target, position) => position !== index)));
  }, []);

  const submit = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addTestProfile({
        ...form,
        dataPointsRequired: Number(form.dataPointsRequired),
        active: true,
        targets: targets.filter((target) => target.targetName.trim().length > 0).map(targetToPayload),
      });
      setForm(EMPTY_PROFILE);
      setTargets([{ ...EMPTY_TARGET }]);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the profile.");
    } finally {
      setBusy(false);
    }
  }, [busy, form, targets, reload]);

  const remove = useCallback(
    async (id) => {
      if (!window.confirm("Delete this matrix profile? Runs logged against it keep their data but lose the assignment.")) {
        return;
      }
      try {
        await deleteTestProfile(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to delete the profile.");
      }
    },
    [reload]
  );

  if (loading) {
    return <Loading label="Loading test matrix..." />;
  }

  return (
    <div>
      {isAdmin ? (
        <ProfileForm
          form={form}
          targets={targets}
          setField={setField}
          setTarget={setTarget}
          onAddTarget={addTargetLine}
          onRemoveTarget={removeTargetLine}
          onSubmit={submit}
          busy={busy}
        />
      ) : (
        <Notice tone="info">Only an admin can change the test matrix.</Notice>
      )}
      {error ? <p style={st.error}>{error}</p> : null}
      <ProfileList profiles={profiles} isAdmin={isAdmin} onDelete={remove} />
    </div>
  );
}

/** The new profile form, including its target lines. */
function ProfileForm(props) {
  const { form, targets, setField, setTarget, onAddTarget, onRemoveTarget, onSubmit, busy } = props;
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Add Matrix Profile</h2>
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Profile code</span>
          <input style={st.input} value={form.code} placeholder="R-1" onChange={(e) => setField("code", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>Mission</span>
          <input style={st.input} value={form.mission} placeholder="ISR, OWA, MULTI-ISR" onChange={(e) => setField("mission", e.target.value)} />
        </label>
      </div>
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Time</span>
          <select style={st.input} value={form.timeOfDay} onChange={(e) => setField("timeOfDay", e.target.value)}>
            <option value="Day">Day</option>
            <option value="Night">Night</option>
          </select>
        </label>
        <label style={st.field}>
          <span style={st.label}>Data points required</span>
          <input style={st.input} type="number" inputMode="numeric" value={form.dataPointsRequired} onChange={(e) => setField("dataPointsRequired", e.target.value)} />
        </label>
      </div>
      <span style={st.label}>Target platforms</span>
      {targets.map((target, index) => (
        <TargetLine
          key={`target-${index}`}
          target={target}
          index={index}
          canRemove={targets.length > 1}
          onChange={setTarget}
          onRemove={onRemoveTarget}
        />
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 4, marginBottom: 14 }}>
        <button style={st.ghostBtn} onClick={onAddTarget}>Add target</button>
      </div>
      <label style={st.field}>
        <span style={st.label}>Notes</span>
        <textarea
          style={{ ...st.input, minHeight: 60, resize: "vertical", paddingTop: 10 }}
          value={form.notes}
          placeholder="Coordinated launch staggered by 10 seconds, S-curve profile, and so on"
          onChange={(e) => setField("notes", e.target.value)}
        />
      </label>
      <button style={{ ...st.priBtn, width: "100%", opacity: busy ? 0.6 : 1 }} onClick={onSubmit} disabled={busy}>
        Add profile
      </button>
    </div>
  );
}

/** One target platform row inside the profile form. */
function TargetLine({ target, index, canRemove, onChange, onRemove }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <label style={st.field}>
        <span style={st.label}>Platform {index + 1}</span>
        <input style={st.input} value={target.targetName} placeholder="Raider, Mojito, Mavic Pro" onChange={(e) => onChange(index, "targetName", e.target.value)} />
      </label>
      <div style={st.grid2}>
        <label style={st.field}>
          <span style={st.label}>Elevation (ft AGL)</span>
          <input style={st.input} type="number" inputMode="decimal" value={target.elevationFtAgl} onChange={(e) => onChange(index, "elevationFtAgl", e.target.value)} />
        </label>
        <label style={st.field}>
          <span style={st.label}>Speed (mph)</span>
          <input style={st.input} type="number" inputMode="decimal" value={target.speedMph} onChange={(e) => onChange(index, "speedMph", e.target.value)} />
        </label>
      </div>
      <label style={st.field}>
        <span style={st.label}>Launch point</span>
        <input style={st.input} value={target.launchPoint} placeholder="11/17" onChange={(e) => onChange(index, "launchPoint", e.target.value)} />
      </label>
      {canRemove ? (
        <button style={st.dangerBtn} onClick={() => onRemove(index)}>Remove platform</button>
      ) : null}
    </div>
  );
}

/** The stored matrix, laid out the way the source table reads. */
function ProfileList({ profiles, isAdmin, onDelete }) {
  if (profiles.length === 0) {
    return (
      <div style={st.card}>
        <h2 style={st.secHead}>Test Matrix</h2>
        <p style={st.meta}>
          No profiles defined. Runs can still be logged, but the report cannot state matrix
          coverage without a matrix to measure against.
        </p>
      </div>
    );
  }
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Test Matrix ({profiles.length})</h2>
      {profiles.map((profile) => (
        <div key={profile.id} style={st.rowItem}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ fontFamily: MONO, fontSize: 15 }}>{profile.code}</strong>
              <span style={st.meta}>{profile.mission || "Unspecified"}</span>
              <span style={st.meta}>{profile.timeOfDay}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.olive }}>
                {profile.dataPointsRequired} data points
              </span>
            </div>
            {profile.targets.map((target) => (
              <div key={target.id} style={{ ...st.meta, marginTop: 4 }}>
                {target.targetName}
                {target.elevationFtAgl === null ? "" : ` | ${target.elevationFtAgl} ft`}
                {target.speedMph === null ? "" : ` | ${target.speedMph} mph`}
                {target.launchPoint ? ` | LP ${target.launchPoint}` : ""}
              </div>
            ))}
            {profile.notes ? (
              <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{profile.notes}</div>
            ) : null}
          </div>
          {isAdmin ? (
            <button style={st.dangerBtn} onClick={() => onDelete(profile.id)}>Delete</button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
