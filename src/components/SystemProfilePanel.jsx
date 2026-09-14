import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, saveSystemProfile } from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Notice } from "./ui.jsx";

/**
 * System profile. The catalog entries tagged as system tier are properties
 * of the system under test rather than of any single run, so they are
 * answered once per interceptor instead of being asked at the range.
 *
 * Every control on this screen is generated from the catalog. Adding a KPP
 * to the framework adds a field here with no change to this file, which is
 * the reason the catalog is data and not a set of columns.
 */

/**
 * Narrative MOPs from Criteria 4 and 5 that live beside the KPP answers.
 * The criteria score each of these Y/N or Pass/Fail, so the verdict is
 * captured next to the narrative rather than read out of it: a paragraph
 * of prose is evidence, and a scorecard cannot score prose.
 */
const NARRATIVE_MOPS = Object.freeze([
  { key: "mop.4.1.1", verdict: "passfail", label: "MOP 4.1.1 Impact on Co-located Systems", hint: "Frequency, power, and modalities, and how these affect nearby systems." },
  { key: "mop.4.1.2", verdict: "passfail", label: "MOP 4.1.2 HERO / HERP / HERF", hint: "Hazard of electromagnetic radiation to ordnance, personnel, and fuel." },
  { key: "mop.5.1.1", verdict: "yesno", label: "MOP 5.1.1 RMF Compliance", hint: "ATO and ATC status, with dates and control numbers." },
  { key: "mop.5.2.1", verdict: "yesno", label: "MOP 5.2.1 Contested Environment", hint: "Observed degradation under threat electronic warfare." },
  { key: "mop.5.3.1", verdict: "passfail", label: "MOP 5.3.1 Hazard Prevention", hint: "Musculoskeletal, noise, radiation, and chemical risk controls." },
  { key: "mop.5.3.2", verdict: "yesno", label: "MOP 5.3.2 Collateral Damage Mitigation", hint: "Restricted firing sector exchange with the C2 system." },
]);

/** Verdict options per narrative MOP type. Unanswered is never the same as a fail. */
const VERDICT_OPTIONS = Object.freeze({
  yesno: [
    { key: "yes", text: "Yes", color: C.success },
    { key: "no", text: "No", color: C.miss },
    { key: "", text: "Unanswered", color: C.inkMuted },
  ],
  passfail: [
    { key: "pass", text: "Pass", color: C.success },
    { key: "fail", text: "Fail", color: C.miss },
    { key: "", text: "Unanswered", color: C.inkMuted },
  ],
});

/** @returns {number} Answered fields across the catalog and narrative MOPs. */
function countAnswered(profile) {
  return Object.values(profile).filter((value) => String(value).trim().length > 0).length;
}

/** @param {{ catalog: object, interceptors: object[], isAdmin: boolean }} props */
export function SystemProfilePanel({ catalog, interceptors, isAdmin }) {
  const [selectedId, setSelectedId] = useState("");
  const [profile, setProfile] = useState({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedId === "" && interceptors.length > 0) {
      setSelectedId(String(interceptors[0].id));
    }
  }, [interceptors, selectedId]);

  const selected = useMemo(
    () => interceptors.find((entry) => String(entry.id) === selectedId) || null,
    [interceptors, selectedId]
  );

  useEffect(() => {
    setProfile(selected?.profile || {});
    setStatus("");
  }, [selected]);

  const setAnswer = useCallback((key, value) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setStatus("");
  }, []);

  const save = useCallback(async () => {
    if (selected === null || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveSystemProfile(selected.id, profile);
      setStatus(`Saved ${countAnswered(profile)} answers for ${selected.name}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the system profile.");
    } finally {
      setBusy(false);
    }
  }, [selected, profile, busy]);

  if (interceptors.length === 0) {
    return <Notice tone="info">Add an interceptor in the Fleet tab before building a system profile.</Notice>;
  }

  return (
    <div>
      <div style={st.card}>
        <h2 style={st.secHead}>System Under Test</h2>
        <label style={st.field}>
          <span style={st.label}>Interceptor</span>
          <select style={st.input} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {interceptors.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <p style={st.meta}>
          {countAnswered(profile)} answered. Blank fields print as not measured on the report
          rather than being left out, so a gap stays visible.
        </p>
      </div>

      {catalog.categories
        .filter((category) => category.entries.some((entry) => entry.tier === "system"))
        .map((category) => (
          <CategoryCard
            key={category.section}
            category={category}
            profile={profile}
            onAnswer={setAnswer}
            disabled={!isAdmin}
          />
        ))}

      <NarrativeCard profile={profile} onAnswer={setAnswer} disabled={!isAdmin} />

      {error ? <p style={st.error}>{error}</p> : null}
      {status ? <Notice tone="info">{status}</Notice> : null}
      {isAdmin ? (
        <button style={{ ...st.priBtn, width: "100%", opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>
          Save system profile
        </button>
      ) : (
        <Notice tone="info">Only an admin can change the system profile.</Notice>
      )}
    </div>
  );
}

/** One catalog section rendered as a card of generated controls. */
function CategoryCard({ category, profile, onAnswer, disabled }) {
  const entries = category.entries.filter((entry) => entry.tier === "system");
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>
        {category.section} {category.name}
      </h2>
      {entries.map((entry) => (
        <CatalogControl
          key={entry.id}
          entry={entry}
          value={profile[entry.id] || ""}
          onChange={(value) => onAnswer(entry.id, value)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/** @returns {JSX.Element} The control matching a catalog entry's input type. */
function CatalogControl({ entry, value, onChange, disabled }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={st.label}>
        {entry.label} {entry.measure} ({entry.units})
      </span>
      <p style={{ ...st.meta, marginTop: 0, marginBottom: 6 }}>{entry.description}</p>
      {entry.input === "yesno" ? (
        <YesNo value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <input
          style={st.input}
          type={entry.input === "number" ? "number" : "text"}
          inputMode={entry.input === "number" ? "decimal" : "text"}
          value={value}
          disabled={disabled}
          placeholder={entry.input === "list" ? "Comma separated" : entry.units}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/** A yes / no / unanswered control. Unanswered is never the same as no. */
function YesNo({ value, onChange, disabled }) {
  return <Choice options={VERDICT_OPTIONS.yesno} value={value} onChange={onChange} disabled={disabled} />;
}

/** @returns {JSX.Element} A row of mutually exclusive answer buttons. */
function Choice({ options, value, onChange, disabled }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
      {options.map((option) => (
        <button
          key={option.key || "unset"}
          disabled={disabled}
          onClick={() => onChange(option.key)}
          style={{
            ...st.outcomeBtn,
            minHeight: 42,
            fontSize: 13,
            opacity: disabled ? 0.6 : 1,
            borderColor: value === option.key ? option.color : C.line,
            color: value === option.key ? option.color : C.inkMuted,
            background: value === option.key ? `${option.color}12` : C.panel,
          }}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

/** The narrative answers behind the qualitative MOPs of Criteria 4 and 5. */
function NarrativeCard({ profile, onAnswer, disabled }) {
  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Criteria 4 and 5 Narrative</h2>
      <p style={{ ...st.meta, marginBottom: 12, fontFamily: MONO }}>
        These MOPs are stated rather than measured. The text prints verbatim in the
        report; the verdict beside it is what the scorecard scores, and leaving it
        unanswered reports the row as having no data rather than as a pass.
      </p>
      {NARRATIVE_MOPS.map((item) => (
        <NarrativeField key={item.key} item={item} profile={profile} onAnswer={onAnswer} disabled={disabled} />
      ))}
    </div>
  );
}

/** One narrative MOP: the evidence text and the verdict the scorecard scores. */
function NarrativeField({ item, profile, onAnswer, disabled }) {
  const verdictKey = `${item.key}.verdict`;
  return (
    <div style={st.field}>
      <span style={st.label}>{item.label}</span>
      <p style={{ ...st.meta, marginTop: 0, marginBottom: 6 }}>{item.hint}</p>
      <textarea
        style={{ ...st.input, minHeight: 72, resize: "vertical", paddingTop: 10 }}
        value={profile[item.key] || ""}
        disabled={disabled}
        onChange={(event) => onAnswer(item.key, event.target.value)}
      />
      <span style={{ ...st.label, marginTop: 10 }}>Scorecard verdict</span>
      <Choice
        options={VERDICT_OPTIONS[item.verdict]}
        value={profile[verdictKey] || ""}
        onChange={(value) => onAnswer(verdictKey, value)}
        disabled={disabled}
      />
    </div>
  );
}
