import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEngagement,
  ApiError,
  deleteEngagement,
  getCurrentDay,
  getDayCriteria,
  listDrones,
  listInterceptors,
  listTestProfiles,
  updateEngagement,
} from "../api.js";
import { useStopwatch } from "../hooks.js";
import { C, MONO, st } from "../styles.js";
import { Loading, Notice } from "./ui.jsx";
import { SCENARIOS } from "./StagePicker.jsx";
import { WeatherPanel } from "./WeatherPanel.jsx";

/**
 * Score tab. Shows the live scoreboard for today, the live C4 scorecard
 * standing beneath it, a large touch-friendly engagement form with a
 * built-in stopwatch, and the day's engagement log.
 *
 * The scorecard strip is the whole point of the coupling between this tab
 * and the Criteria tab: logging an engagement is the only action a scorer
 * takes, and every criteria row that engagement bears on is measured,
 * scored, and rolled into the Overall System Score from that one action.
 * The strip shows the result immediately, so a scorer never has to leave
 * this screen to know where the evaluation stands.
 */

const OUTCOMES = Object.freeze([
  { value: "success", label: "Success", color: C.success },
  { value: "unsuccessful", label: "Miss", color: C.miss },
  { value: "not_attempted", label: "No Attempt", color: C.noAttempt },
]);

const RUN_TYPES = Object.freeze([
  { value: "red_air", label: "Red Air Intercept", hint: "Counts toward Pk" },
  { value: "abort", label: "Abort Run", hint: "Excluded from Pk" },
]);

/**
 * Abort runs test the abort or terminate command, so the stored outcome
 * values read differently there than on an intercept run.
 * @param {string} runType
 * @returns {object[]} Outcome options labeled for this run type.
 */
function outcomesFor(runType) {
  if (runType !== "abort") {
    return OUTCOMES;
  }
  return [
    { value: "success", label: "Abort OK", color: C.success },
    { value: "unsuccessful", label: "Abort Failed", color: C.miss },
    { value: "not_attempted", label: "No Attempt", color: C.noAttempt },
  ];
}

const EMPTY_FORM = Object.freeze({
  sortie: "",
  droneId: "",
  interceptorId: "",
  testProfileId: "",
  runType: "red_air",
  stageReached: null,
  outcome: "success",
  scenario: "mlcoa",
  timeToInterceptS: "",
  engagementRangeM: "",
  altitudeM: "",
  detectRangeM: "",
  detectAltM: "",
  trackContinuityPct: "",
  trackErrorM: "",
  idRangeM: "",
  idTimeS: "",
  identifiedOk: "",
  detectTimeS: "",
  decideTimeS: "",
  notes: "",
});

/** @returns {object} Payload with blank numeric fields converted to null. */
function toPayload(form) {
  const asNumber = (value) => (value === "" ? null : Number(value));
  const abort = form.runType === "abort";
  return {
    sortie: form.sortie,
    droneId: form.droneId === "" ? null : Number(form.droneId),
    interceptorId: form.interceptorId === "" ? null : Number(form.interceptorId),
    testProfileId: form.testProfileId === "" ? null : Number(form.testProfileId),
    runType: form.runType,
    // An abort run tests the terminate command rather than the kill chain,
    // so it carries no stage and must not be counted as a failure to detect.
    stageReached: abort ? null : form.stageReached,
    outcome: form.outcome,
    scenario: form.scenario,
    timeToInterceptS: asNumber(form.timeToInterceptS),
    engagementRangeM: asNumber(form.engagementRangeM),
    altitudeM: asNumber(form.altitudeM),
    detectRangeM: asNumber(form.detectRangeM),
    detectAltM: asNumber(form.detectAltM),
    trackContinuityPct: asNumber(form.trackContinuityPct),
    trackErrorM: asNumber(form.trackErrorM),
    idRangeM: asNumber(form.idRangeM),
    idTimeS: asNumber(form.idTimeS),
    identifiedOk: form.identifiedOk === "" ? null : form.identifiedOk,
    detectTimeS: asNumber(form.detectTimeS),
    decideTimeS: asNumber(form.decideTimeS),
    notes: form.notes,
  };
}

/** @returns {string} A stored numeric field rendered for a form input. */
function formValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * @param {boolean | null} value
 * @returns {string} "yes", "no", or "" for an unanswered field. Null must
 *   not collapse into "no": not noting an identification is different from
 *   recording that it was wrong, and MOP 2.1.4 depends on the difference.
 */
function identifiedOkToForm(value) {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "";
}

/** @param {{ isAdmin: boolean }} props */
export function ScoreTab({ isAdmin }) {
  const [day, setDay] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [stats, setStats] = useState(null);
  const [drones, setDrones] = useState([]);
  const [interceptors, setInterceptors] = useState([]);
  const [testProfiles, setTestProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scorecards, setScorecards] = useState(null);
  const stopwatch = useStopwatch();

  /**
   * Reloads the day and, with it, the criteria scorecard the day's runs
   * produce. The scorecard is fetched here rather than only on the Criteria
   * tab so that the consequence of logging a run is visible where the run
   * was logged. A scorecard that fails to build never blocks scoring: the
   * strip disappears and the engagement form carries on.
   */
  const reload = useCallback(async () => {
    try {
      const [dayData, droneData, interceptorData, profileData] = await Promise.all([
        getCurrentDay(),
        listDrones(),
        listInterceptors(),
        listTestProfiles(),
      ]);
      setDay(dayData.day);
      setEngagements(dayData.engagements);
      setStats(dayData.stats);
      setDrones(droneData.drones);
      setInterceptors(interceptorData.interceptors);
      setTestProfiles(profileData.profiles.filter((profile) => profile.active));
      setError("");
      setScorecards(await loadScorecard(dayData.day.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the day.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * The kill chain stage picker is gone because every stage before engage
   * is a Ground Control Station event a range scorer cannot see. New runs
   * record no stage, so the scorer infers it from the outcome. An older
   * run keeps the stage it was logged with until its outcome changes; then
   * the stored stage no longer fits and is cleared.
   */
  const setField = useCallback((key, value) => {
    setForm((prev) => {
      if (key !== "outcome" || value === prev.outcome) {
        return { ...prev, [key]: value };
      }
      return { ...prev, outcome: value, stageReached: null };
    });
  }, []);

  /**
   * Clears the form but keeps the scenario. A block of runs is flown under
   * one course of action, so re-picking it after every entry would be the
   * extra step this screen exists to avoid.
   */
  const resetForm = useCallback(() => {
    setForm((prev) => ({ ...EMPTY_FORM, scenario: prev.scenario }));
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
      testProfileId: engagement.testProfileId === null ? "" : String(engagement.testProfileId),
      runType: engagement.runType || "red_air",
      stageReached: engagement.stageReached ?? null,
      outcome: engagement.outcome,
      timeToInterceptS: formValue(engagement.timeToInterceptS),
      engagementRangeM: formValue(engagement.engagementRangeM),
      altitudeM: formValue(engagement.altitudeM),
      detectRangeM: formValue(engagement.detectRangeM),
      detectAltM: formValue(engagement.detectAltM),
      trackContinuityPct: formValue(engagement.trackContinuityPct),
      trackErrorM: formValue(engagement.trackErrorM),
      idRangeM: formValue(engagement.idRangeM),
      idTimeS: formValue(engagement.idTimeS),
      identifiedOk: identifiedOkToForm(engagement.identifiedOk),
      scenario: engagement.scenario || "mlcoa",
      detectTimeS: formValue(engagement.detectTimeS),
      decideTimeS: formValue(engagement.decideTimeS),
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
      <ScorecardStrip systems={scorecards} />
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
          testProfiles={testProfiles}
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

/**
 * @param {number} dayId
 * @returns {Promise<object[] | null>} Each system's scorecard, primary
 *   first, or null when it could not be built. A criteria failure must never stop a scorer from
 *   logging the next run, so this swallows the error rather than raising.
 */
async function loadScorecard(dayId) {
  try {
    const review = await getDayCriteria(dayId);
    const systems = (review.systems || []).map((pkg) => ({ name: pkg.system.name, scorecard: pkg.scorecard }));
    return systems.length > 0 ? systems : [{ name: null, scorecard: review.scorecard }];
  } catch {
    return null;
  }
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

/**
 * The live C4 scorecard, standing under the day scoreboard, one line per
 * interceptor flown today. Every value here follows from runs already
 * logged: no scorer action produces it and none is asked for. Each system
 * is scored from its own runs, so logging a run moves only that system's
 * line.
 */
function ScorecardStrip({ systems }) {
  if (systems === null) {
    return null;
  }
  const scored = systems.reduce((sum, entry) => sum + entry.scorecard.states.scored, 0);
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>C4 Scorecard, Live</h2>
      {systems.map((entry) => (
        <SystemLine key={entry.name || "none"} name={entry.name} scorecard={entry.scorecard} showName={systems.length > 1} />
      ))}
      <p style={{ ...st.meta, marginTop: 10 }}>
        {systems.length > 1
          ? `${systems.length} systems flown today, each scored from its own runs. `
          : ""}
        {scored} criteria rows scored from the runs logged so far. Open the Criteria tab for the
        full tables.
      </p>
    </div>
  );
}

/** One system's overall score, area scores, and effectiveness flag. */
function SystemLine({ name, scorecard, showName }) {
  const overall = scorecard.overall === null ? "Not Assessed" : scorecard.overall.toFixed(2);
  return (
    <div style={{ paddingTop: showName ? 10 : 0, marginTop: showName ? 6 : 0, borderTop: showName ? `1px solid ${C.line}` : "none" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {showName ? <strong style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}>{name}</strong> : null}
        <span style={{ fontFamily: MONO, fontSize: showName ? 22 : 30, color: C.olive }}>{overall}</span>
        <span style={st.meta}>Overall System Score, out of 2</span>
      </div>
      {scorecard.notMilitarilyEffective ? (
        <Notice tone="error">
          Not Militarily Effective: {scorecard.criticalFailures.map((entry) => entry.label).join(", ")}{" "}
          scored 0 against a Critical KPP.
        </Notice>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, marginTop: 8 }}>
        {scorecard.areas.map((area) => (
          <div key={area.id} style={{ textAlign: "center", padding: "6px 2px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <div style={{ ...st.stripLabel, fontSize: 9, color: C.inkMuted }}>Crit {area.id}</div>
            <div style={{ fontFamily: MONO, fontSize: area.score === null ? 10 : 17, color: area.score === null ? C.inkMuted : C.olive }}>
              {area.score === null ? "Not Assessed" : area.score.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The engagement entry form with the big outcome selector and stopwatch. */
function EngagementForm(props) {
  const { form, setField, drones, interceptors, testProfiles, editingId, busy, stopwatch } = props;
  const { onUseStopwatch, onSubmit, onCancel } = props;
  const droneOptions = useMemo(
    () => [{ id: "", name: "Select target drone" }, ...drones],
    [drones]
  );
  const interceptorOptions = useMemo(
    () => [{ id: "", name: "Select interceptor" }, ...interceptors],
    [interceptors]
  );
  const profileOptions = useMemo(
    () => [
      { id: "", label: "No matrix profile" },
      ...testProfiles.map((profile) => ({
        id: profile.id,
        label: `${profile.code} - ${profile.mission || "Unspecified"} (${profile.timeOfDay})`,
      })),
    ],
    [testProfiles]
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
      {testProfiles.length > 0 ? (
        <label style={st.field}>
          <span style={st.label}>Test matrix profile</span>
          <select
            style={st.input}
            value={form.testProfileId}
            onChange={(e) => setField("testProfileId", e.target.value)}
          >
            {profileOptions.map((option) => (
              <option key={option.id || "none"} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <span style={st.label}>Scenario</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {SCENARIOS.map((option) => {
          const active = form.scenario === option.key;
          return (
            <button
              key={option.key}
              onClick={() => setField("scenario", option.key)}
              style={{
                ...st.outcomeBtn,
                minHeight: 52,
                fontSize: 14,
                borderColor: active ? C.olive : C.line,
                color: active ? C.olive : C.inkMuted,
                background: active ? `${C.olive}12` : C.panel,
              }}
            >
              {option.label}
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
      <span style={st.label}>Run type</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {RUN_TYPES.map((option) => {
          const active = form.runType === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setField("runType", option.value)}
              style={{
                ...st.outcomeBtn,
                minHeight: 60,
                fontSize: 14,
                borderColor: active ? C.olive : C.line,
                color: active ? C.olive : C.inkMuted,
                background: active ? `${C.olive}12` : C.panel,
              }}
            >
              {option.label}
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
      <span style={st.label}>Outcome</span>
      <div style={{ ...st.outcomeRow, marginBottom: 14 }}>
        {outcomesFor(form.runType).map((option) => {
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
      <label style={st.field}>
        <span style={st.label}>Time to intercept (s)</span>
        <input style={st.input} type="number" inputMode="decimal" value={form.timeToInterceptS} onChange={(e) => setField("timeToInterceptS", e.target.value)} />
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

/**
 * @param {string} key
 * @returns {string} A readable kill chain stage for the log line, so a
 *   scorer can see at a glance which runs carry captured stage data and
 *   which will be inferred on the report.
 */
function stageLabel(key) {
  const found = KILL_CHAIN_LABELS[key];
  return found ? `Stage: ${found}` : "";
}

const KILL_CHAIN_LABELS = Object.freeze({
  none: "No Detect",
  detect: "Detect",
  track: "Track",
  classify: "Classify",
  identify: "Identify",
  engage: "Engage",
  defeat: "Defeat",
});

/** A single engagement line with outcome color and admin controls. */
function EngagementRow({ engagement, isAdmin, onEdit, onDelete }) {
  const runType = engagement.runType || "red_air";
  const isAbort = runType === "abort";
  const outcome = outcomesFor(runType).find((option) => option.value === engagement.outcome);
  return (
    <div style={st.rowItem}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
              color: isAbort ? C.noAttempt : C.olive,
              border: `1px solid ${isAbort ? C.noAttempt : C.olive}`,
            }}
          >
            {isAbort ? "Abort" : "Red Air"}
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
          {engagement.scenario ? `${engagement.scenario.toUpperCase()} | ` : ""}
          {engagement.stageReached ? `${stageLabel(engagement.stageReached)} | ` : ""}
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
