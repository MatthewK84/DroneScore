import { useCallback, useEffect, useState } from "react";
import {
  addDrone,
  addInterceptor,
  ApiError,
  deleteDrone,
  deleteInterceptor,
  listDrones,
  listInterceptors,
} from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Field, Loading, Notice } from "./ui.jsx";

/**
 * Fleet tab. Authorized users add target drones and interceptor
 * platforms live in the field. Admins remove existing entries.
 */

const EMPTY_DRONE = Object.freeze({
  name: "",
  uasGroup: "",
  airframe: "",
  weightKg: "",
  maxSpeedMs: "",
  propulsion: "",
  controlLink: "",
  notes: "",
});

const GROUP_OPTIONS = Object.freeze([
  { value: "", label: "Group (optional)" },
  { value: "1", label: "Group 1" },
  { value: "2", label: "Group 2" },
  { value: "3", label: "Group 3" },
  { value: "4", label: "Group 4" },
  { value: "5", label: "Group 5" },
]);

/** @returns {object} Drone payload with blank numbers converted to null. */
function droneToPayload(form) {
  return {
    ...form,
    weightKg: form.weightKg === "" ? null : Number(form.weightKg),
    maxSpeedMs: form.maxSpeedMs === "" ? null : Number(form.maxSpeedMs),
  };
}

/** @param {{ isAdmin: boolean }} props */
export function FleetTab({ isAdmin }) {
  const [drones, setDrones] = useState([]);
  const [interceptors, setInterceptors] = useState([]);
  const [droneForm, setDroneForm] = useState(EMPTY_DRONE);
  const [interceptorName, setInterceptorName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [droneData, interceptorData] = await Promise.all([listDrones(), listInterceptors()]);
      setDrones(droneData.drones);
      setInterceptors(interceptorData.interceptors);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the fleet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setDroneField = useCallback((key, value) => {
    setDroneForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submitDrone = useCallback(async () => {
    if (!droneForm.name.trim()) {
      setError("Drone name is required.");
      return;
    }
    try {
      await addDrone(droneToPayload(droneForm));
      setDroneForm(EMPTY_DRONE);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add the drone.");
    }
  }, [droneForm, reload]);

  const submitInterceptor = useCallback(async () => {
    if (!interceptorName.trim()) {
      setError("Interceptor name is required.");
      return;
    }
    try {
      await addInterceptor({ name: interceptorName });
      setInterceptorName("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add the interceptor.");
    }
  }, [interceptorName, reload]);

  const removeDrone = useCallback(
    async (id) => {
      if (!window.confirm("Delete this drone?")) {
        return;
      }
      try {
        await deleteDrone(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to delete.");
      }
    },
    [reload]
  );

  const removeInterceptor = useCallback(
    async (id) => {
      if (!window.confirm("Delete this interceptor?")) {
        return;
      }
      try {
        await deleteInterceptor(id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to delete.");
      }
    },
    [reload]
  );

  if (loading) {
    return <Loading label="Loading fleet..." />;
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div style={st.card}>
        <h2 style={st.secHead}>Add Target Drone</h2>
        <Field label="Name" value={droneForm.name} onChange={(v) => setDroneField("name", v)} placeholder="Shahed-136 analog" />
        <div style={st.grid2}>
          <Field label="UAS group" value={droneForm.uasGroup} onChange={(v) => setDroneField("uasGroup", v)} options={GROUP_OPTIONS} />
          <Field label="Airframe" value={droneForm.airframe} onChange={(v) => setDroneField("airframe", v)} placeholder="Delta wing" />
        </div>
        <div style={st.grid2}>
          <Field label="Weight (kg)" value={droneForm.weightKg} onChange={(v) => setDroneField("weightKg", v)} type="number" />
          <Field label="Max speed (m/s)" value={droneForm.maxSpeedMs} onChange={(v) => setDroneField("maxSpeedMs", v)} type="number" />
        </div>
        <div style={st.grid2}>
          <Field label="Propulsion" value={droneForm.propulsion} onChange={(v) => setDroneField("propulsion", v)} placeholder="Electric" />
          <Field label="Control link" value={droneForm.controlLink} onChange={(v) => setDroneField("controlLink", v)} placeholder="5.8 GHz analog" />
        </div>
        <Field label="Notes" value={droneForm.notes} onChange={(v) => setDroneField("notes", v)} area />
        <button style={{ ...st.priBtn, width: "100%" }} onClick={submitDrone}>Add drone</button>
      </div>

      <div style={st.card}>
        <h2 style={st.secHead}>Target Drones</h2>
        {drones.length === 0 ? (
          <p style={st.meta}>No drones yet. Add one above.</p>
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
              {isAdmin ? <button style={st.dangerBtn} onClick={() => removeDrone(drone.id)}>Delete</button> : null}
            </div>
          ))
        )}
      </div>

      <div style={st.card}>
        <h2 style={st.secHead}>Interceptors</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ ...st.field, flex: 1, marginBottom: 0, minWidth: 180 }}>
            <span style={st.label}>Add interceptor</span>
            <input style={st.input} value={interceptorName} placeholder="SICA" onChange={(e) => setInterceptorName(e.target.value)} />
          </label>
          <button style={st.priBtn} onClick={submitInterceptor}>Add</button>
        </div>
        {interceptors.map((interceptor) => (
          <div key={interceptor.id} style={st.rowItem}>
            <strong style={{ fontFamily: MONO, fontSize: 14 }}>{interceptor.name}</strong>
            {isAdmin ? <button style={st.dangerBtn} onClick={() => removeInterceptor(interceptor.id)}>Delete</button> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
