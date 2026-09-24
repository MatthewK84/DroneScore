import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, applyBenchmarksBulk, deriveTimelinePresets, getTimelineDefaults } from "../api.js";
import { conflictsFor } from "../preset-logic.js";
import { st } from "../styles.js";
import { ConfirmApplyDialog } from "./ConfirmApplyDialog.jsx";
import { PresetList } from "./PresetList.jsx";
import { TimelineParamsCard } from "./TimelineParamsCard.jsx";
import { TimelineStrip } from "./TimelineStrip.jsx";
import { Notice } from "./ui.jsx";

/**
 * Timeline-budget benchmark presets (C4 ETA 60 s / 180 s). Parameters
 * recompute the preview as they change. Nothing is stored until an apply
 * button is clicked, and every write goes through the bulk route so the
 * server can refuse a silent overwrite.
 */

const PREVIEW_DELAY_MS = 250;
const EMPTY_PREVIEW = Object.freeze({ rows: [], milestones: [], errors: [] });

/** @returns {string} A readable message from any thrown value. */
function messageOf(err, fallback) {
  return err instanceof ApiError ? err.message : fallback;
}

/** @returns {string[]} The validation errors a failed preview carried. */
function previewErrors(err) {
  const listed = err instanceof ApiError ? err.details?.errors : null;
  return Array.isArray(listed) ? listed : [messageOf(err, "Failed to resolve the presets.")];
}

/** Loads the default parameters and payload types once. */
function useTimelineDefaults(onError) {
  const [defaults, setDefaults] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getTimelineDefaults();
        if (!cancelled) {
          setDefaults(data);
        }
      } catch (err) {
        onError(messageOf(err, "Failed to load the preset defaults."));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [onError]);
  return defaults;
}

/** Recomputes the preview shortly after the parameters stop changing. */
function useTimelinePreview(form, payloads) {
  const [preview, setPreview] = useState(EMPTY_PREVIEW);
  useEffect(() => {
    if (form === null) {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await deriveTimelinePresets(form, payloads);
        if (!cancelled) {
          setPreview({ rows: data.rows, milestones: data.milestones, errors: [] });
        }
      } catch (err) {
        if (!cancelled) {
          setPreview({ ...EMPTY_PREVIEW, errors: previewErrors(err) });
        }
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form, payloads]);
  return preview;
}

/** Form state and its updaters. Each update returns a new object. */
function useTimelineForm() {
  const [form, setForm] = useState(null);
  const onShared = useCallback((key, value) => setForm((prev) => ({ ...prev, [key]: value })), []);
  const onLevel = useCallback((level, key, value) => {
    setForm((prev) => ({ ...prev, [level]: { ...prev[level], [key]: value } }));
  }, []);
  const onPhase = useCallback((level, phase, value) => {
    setForm((prev) => ({ ...prev, [level]: { ...prev[level], phases: { ...prev[level].phases, [phase]: value } } }));
  }, []);
  return { form, setForm, onShared, onLevel, onPhase };
}

/** @returns {string} How many rows a write stored and how many already matched. */
function storedMessage(written, unchanged) {
  return `Stored ${written} ${written === 1 ? "row" : "rows"}. ${unchanged} already matched.`;
}

/** Writes items, and turns a 409 into a confirmation dialog. */
function useBulkApply({ scopeId, onWritten, setDialog, setError, setStatus }) {
  const [busy, setBusy] = useState(false);
  const apply = useCallback(
    async (items, confirmOverwrite) => {
      setBusy(true);
      setError("");
      setStatus("");
      try {
        const data = await applyBenchmarksBulk({ interceptorId: scopeId, uasGroup: "", confirmOverwrite, items });
        setStatus(storedMessage(data.written, data.unchanged));
        setDialog(null);
        await onWritten();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setDialog({ kind: "conflict", items, conflicts: err.details?.conflicts || [] });
          return;
        }
        setError(messageOf(err, "Failed to store the benchmarks."));
      } finally {
        setBusy(false);
      }
    },
    [scopeId, onWritten, setDialog, setError, setStatus]
  );
  return { busy, apply };
}

/** The click handlers for the list and the confirm dialog. */
function usePresetActions({ benchmarks, scopeId, onWritten, setError, setStatus }) {
  const [dialog, setDialog] = useState(null);
  const { busy, apply } = useBulkApply({ scopeId, onWritten, setDialog, setError, setStatus });
  const applyNow = useCallback((items) => apply(items, false), [apply]);
  const reviewJudgment = useCallback(
    (items) => setDialog({ kind: "judgment", items, conflicts: conflictsFor(items, benchmarks, scopeId) }),
    [benchmarks, scopeId]
  );
  const confirm = useCallback(() => apply(dialog.items, true), [apply, dialog]);
  const cancel = useCallback(() => setDialog(null), []);
  return { busy, dialog, applyNow, reviewJudgment, confirm, cancel };
}

/** The selected payload types, defaulting to the non-kinetic set. */
function usePayloads(defaults) {
  const [payloads, setPayloads] = useState(null);
  const selected = useMemo(() => payloads ?? defaults?.defaultPayloadTypes ?? [], [payloads, defaults]);
  const toggle = useCallback(
    (type) => setPayloads(selected.includes(type) ? selected.filter((entry) => entry !== type) : [...selected, type]),
    [selected]
  );
  return { selected, toggle };
}

/** Error and status lines above the preview. */
function Messages({ previewErrors: lines, error, status }) {
  return (
    <>
      {lines.length > 0 ? (
        <Notice tone="error">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {status ? <Notice tone="info">{status}</Notice> : null}
    </>
  );
}

/**
 * @param {{ interceptors: object[], benchmarks: object[], isAdmin: boolean,
 *   onWritten: () => Promise<void> }} props
 */
export function TimelinePresetsPanel({ interceptors, benchmarks, isAdmin, onWritten }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState("");
  const defaults = useTimelineDefaults(setError);
  const { form, setForm, onShared, onLevel, onPhase } = useTimelineForm();
  const payloads = usePayloads(defaults);
  const preview = useTimelinePreview(form, payloads.selected);
  const scopeId = scope === "" ? null : Number(scope);
  const actions = usePresetActions({ benchmarks, scopeId, onWritten, setError, setStatus });
  const loadDefaults = useCallback(() => setForm(defaults === null ? null : defaults.params), [defaults, setForm]);

  return (
    <div>
      <TimelineParamsCard
        form={form}
        onLoadDefaults={loadDefaults}
        onShared={onShared}
        onLevel={onLevel}
        onPhase={onPhase}
        payloadTypes={defaults?.payloadTypes || []}
        payloads={payloads.selected}
        onTogglePayload={payloads.toggle}
        interceptors={interceptors}
        scope={scope}
        onScope={setScope}
      />
      <Messages previewErrors={preview.errors} error={error} status={status} />
      {!isAdmin && preview.rows.length > 0 ? <p style={st.meta}>Read only. An admin applies presets.</p> : null}
      <TimelineStrip milestones={preview.milestones} />
      <PresetList
        rows={preview.rows}
        benchmarks={benchmarks}
        scopeId={scopeId}
        isAdmin={isAdmin}
        busy={actions.busy}
        onApply={actions.applyNow}
        onApplyJudgment={actions.reviewJudgment}
      />
      {actions.dialog ? (
        <ConfirmApplyDialog dialog={actions.dialog} busy={actions.busy} onConfirm={actions.confirm} onCancel={actions.cancel} />
      ) : null}
    </div>
  );
}
