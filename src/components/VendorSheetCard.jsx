import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  applyVendorSheet,
  listVendorDocuments,
  uploadVendorSheet,
  VENDOR_TEMPLATE_URL,
  vendorDocumentUrl,
} from "../api.js";
import { C, MONO, st } from "../styles.js";
import { Notice } from "./ui.jsx";

/**
 * The vendor data sheet, from blank to applied.
 *
 * The admin downloads the blank sheet and sends it to the vendor. When it
 * comes back, choosing the file reads it and shows exactly what it would
 * change; nothing touches the profile until Apply. That one confirmation
 * replaces reviewing values one by one: every box on the sheet is a single
 * catalog measure in a stated unit, so there is nothing left to interpret,
 * only a whole sheet to accept or discard.
 *
 * Every sheet received stays downloadable as evidence.
 */

const STATUS_LABELS = Object.freeze({ new: "New", changed: "Changes", unchanged: "Same" });
const STATUS_COLORS = Object.freeze({ new: C.success, changed: C.orange, unchanged: C.inkMuted });

/**
 * @param {File} file
 * @returns {Promise<string>} The file's bytes as base64, without the data URL prefix.
 */
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.slice(text.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** @returns {string} A stored value with its unit, for the change list. */
function shown(value, unit) {
  if (value === null || value === undefined) {
    return "--";
  }
  const text = value === "yes" ? "Yes" : value === "no" ? "No" : value;
  const trimmed = text.length > 48 ? `${text.slice(0, 45)}...` : text;
  return unit ? `${trimmed} ${unit}` : trimmed;
}

/** @param {{ interceptor: object, onApplied: () => Promise<void> }} props */
export function VendorSheetCard({ interceptor, onApplied }) {
  const [documents, setDocuments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadDocuments = useCallback(async () => {
    try {
      const data = await listVendorDocuments(interceptor.id);
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data sheets.");
    }
  }, [interceptor.id]);

  useEffect(() => {
    setPreview(null);
    setStatus("");
    setError("");
    loadDocuments();
  }, [loadDocuments]);

  const choose = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || busy) {
        return;
      }
      setBusy(true);
      setError("");
      setStatus("");
      try {
        const data = await readAsBase64(file);
        setPreview(await uploadVendorSheet(interceptor.id, file.name, data));
        await loadDocuments();
      } catch (err) {
        setPreview(null);
        setError(err instanceof ApiError ? err.message : err.message || "Failed to read the data sheet.");
      } finally {
        setBusy(false);
      }
    },
    [busy, interceptor.id, loadDocuments]
  );

  const apply = useCallback(async () => {
    if (preview === null || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await applyVendorSheet(preview.documentId);
      setStatus(`Applied. ${result.written} values written to ${interceptor.name}'s profile, labelled as vendor-declared.`);
      setPreview(null);
      await loadDocuments();
      await onApplied();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply the data sheet.");
    } finally {
      setBusy(false);
    }
  }, [preview, busy, interceptor.name, loadDocuments, onApplied]);

  return (
    <div style={st.card}>
      <h2 style={st.secHead}>Vendor Data Sheet</h2>
      <p style={{ ...st.meta, marginBottom: 12 }}>
        Send the vendor the blank sheet before testing. Each box is one criterion in a stated unit,
        so a completed sheet imports exactly. Performance claims on it are shown beside test
        results and never scored from the sheet.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <a href={VENDOR_TEMPLATE_URL} style={{ ...st.ghostBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Download blank sheet
        </a>
        <label style={{ ...st.priBtn, display: "inline-flex", alignItems: "center", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Reading..." : "Import completed sheet"}
          <input type="file" accept="application/pdf" onChange={choose} disabled={busy} style={{ display: "none" }} />
        </label>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {status ? <Notice tone="info">{status}</Notice> : null}
      {preview ? <Preview preview={preview} busy={busy} onApply={apply} onDiscard={() => setPreview(null)} /> : null}
      <Received documents={documents} />
    </div>
  );
}

/** What applying the chosen sheet would change, and what it could not read. */
function Preview({ preview, busy, onApply, onDiscard }) {
  const { counts, changes, rejected, meta } = preview;
  const writes = counts.new + counts.changed;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 13, color: C.ink, marginBottom: 4 }}>
        {meta.system || "Unnamed system"}{meta.vendor ? ` · ${meta.vendor}` : ""}
      </div>
      <p style={{ ...st.meta, marginBottom: 10 }}>
        {counts.new} new, {counts.changed} changed, {counts.unchanged} the same as the profile
        {rejected.length > 0 ? `, and ${rejected.length} that could not be read` : ""}.
        {meta.date ? ` Completed ${meta.date}.` : ""}
      </p>
      {rejected.length > 0 ? (
        <Notice tone="warn">
          <strong>Not imported.</strong> These boxes could not be read exactly, so they are left
          out rather than guessed. Ask the vendor to correct them:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {rejected.map((entry) => (
              <li key={entry.key}>
                {entry.label}: “{entry.raw}”. {entry.reason}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <div style={{ ...st.tableWrap, maxHeight: 280, overflowY: "auto" }}>
        <table style={{ ...st.table, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={st.th}>Criterion</th>
              <th style={st.th}>Now</th>
              <th style={st.th}>From sheet</th>
              <th style={st.th}>Effect</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.key}>
                <td style={st.td}>
                  <span style={{ fontFamily: MONO, fontSize: 11 }}>{change.label === "Airframe" ? "" : `${change.label} `}</span>
                  {change.measure}
                </td>
                <td style={{ ...st.tdMono, color: C.inkMuted }}>{shown(change.before, change.unit)}</td>
                <td style={st.tdMono}>{shown(change.after, change.unit)}</td>
                <td style={{ ...st.tdMono, fontWeight: 700, color: STATUS_COLORS[change.status] }}>{STATUS_LABELS[change.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={{ ...st.priBtn, flex: 1, opacity: busy || writes === 0 ? 0.6 : 1 }} disabled={busy || writes === 0} onClick={onApply}>
          {writes === 0 ? "Nothing to apply" : `Apply ${writes} ${writes === 1 ? "value" : "values"}`}
        </button>
        <button style={st.ghostBtn} disabled={busy} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

/** Every sheet received for this system, kept as evidence. */
function Received({ documents }) {
  if (documents.length === 0) {
    return <p style={st.meta}>No data sheets received for this system yet.</p>;
  }
  return (
    <div>
      <div style={{ ...st.label, marginBottom: 6 }}>Received</div>
      {documents.map((document) => (
        <div key={document.id} style={{ ...st.rowItem, padding: "8px 0", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>{document.filename || `Sheet ${document.id}`}</div>
            <div style={st.meta}>
              {document.status === "applied" ? "Applied" : "Read, not applied"} · {document.valueCount} values
              {document.rejected.length > 0 ? ` · ${document.rejected.length} unreadable` : ""}
            </div>
          </div>
          <a href={vendorDocumentUrl(document.id)} style={{ ...st.ghostBtn, textDecoration: "none", fontSize: 11 }}>
            PDF
          </a>
        </div>
      ))}
    </div>
  );
}
