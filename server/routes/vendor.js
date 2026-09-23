import express from "express";
import { requireRole } from "../auth.js";
import { applySheet, diffSheet } from "../provenance.js";
import { asId, asText } from "../validate.js";
import { buildTemplatePdf, readTemplatePdf, TEMPLATE_FIELDS } from "../vendor-template.js";

/**
 * Vendor data sheet routes: the blank sheet, and the two-step import of a
 * completed one.
 *
 * Import is read-then-confirm. The upload is read, stored as evidence, and
 * returned as a summary of exactly what it would change; nothing touches
 * the system profile until an admin applies that stored document. Applying
 * uses the values read at upload, so what was previewed is what is written.
 *
 * Everything here is admin only except downloading a stored sheet, which
 * scorers may need as evidence at the range.
 */

/** Completed sheets are small; this is several times the size of a filled one. */
export const MAX_SHEET_BYTES = 2 * 1024 * 1024;

/** Base64 inflates by a third; the route's body limit must admit the largest sheet. */
export const SHEET_BODY_LIMIT = "4mb";

const FIELDS_BY_KEY = new Map(TEMPLATE_FIELDS.map((field) => [field.key, field]));

/** @returns {object} A change row with the field's label and unit attached. */
function describeChange(change) {
  const field = FIELDS_BY_KEY.get(change.key);
  return {
    ...change,
    label: field?.label === "Airframe" ? "Airframe" : field?.label || change.key,
    measure: field?.measure || change.key,
    unit: field?.input === "number" ? field.unit : "",
  };
}

/** @returns {{ changes: object[], counts: object }} What applying would do. */
function summarize(profile, values, rejected) {
  const changes = diffSheet(profile, values).map(describeChange);
  const counts = { new: 0, changed: 0, unchanged: 0, rejected: rejected.length };
  for (const change of changes) {
    counts[change.status] += 1;
  }
  return { changes, counts };
}

/**
 * Decodes an uploaded sheet, refusing anything that is not a PDF of a
 * plausible size before any parser sees it.
 *
 * @returns {{ bytes?: Buffer, error?: string }}
 */
function decodeUpload(data) {
  if (typeof data !== "string" || data.length === 0) {
    return { error: "No file was received." };
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > MAX_SHEET_BYTES) {
    return { error: "The file is larger than 2 MB. A completed data sheet is well under that." };
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { error: "The file is not a PDF." };
  }
  return { bytes };
}

/** Maps a stored document to the API shape, without its bytes. */
function documentToApi(row) {
  return {
    id: Number(row.id),
    interceptorId: Number(row.interceptor_id),
    filename: row.filename,
    meta: row.meta || {},
    status: row.status,
    valueCount: Object.keys(row.sheet_values || {}).length,
    rejected: row.rejected || [],
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

/**
 * Applies a previewed document inside one transaction, locking the document
 * and the interceptor so a document is never applied twice and an evaluator
 * edit cannot interleave.
 *
 * @returns {Promise<{ notFound?: true, alreadyApplied?: true, written?: number }>}
 */
async function applyDocument(pool, documentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM vendor_documents WHERE id=$1 FOR UPDATE", [documentId]);
    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return { notFound: true };
    }
    const document = found.rows[0];
    if (document.status === "applied") {
      await client.query("ROLLBACK");
      return { alreadyApplied: true };
    }
    const system = await client.query(
      "SELECT profile, profile_sources FROM interceptors WHERE id=$1 FOR UPDATE",
      [document.interceptor_id]
    );
    const importedAt = new Date().toISOString();
    const result = applySheet(system.rows[0].profile || {}, system.rows[0].profile_sources || {}, document.sheet_values || {}, {
      documentId: Number(document.id),
      importedAt,
    });
    await client.query("UPDATE interceptors SET profile=$1, profile_sources=$2 WHERE id=$3", [
      JSON.stringify(result.profile),
      JSON.stringify(result.sources),
      document.interceptor_id,
    ]);
    await client.query("UPDATE vendor_documents SET status='applied', applied_at=$1 WHERE id=$2", [importedAt, documentId]);
    await client.query("COMMIT");
    return { written: result.written };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** @param {import("pg").Pool} pool */
export function createVendorRouter(pool) {
  const router = express.Router();

  router.get("/vendor-template.pdf", requireRole("admin"), async (_req, res) => {
    try {
      const bytes = await buildTemplatePdf();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="JIATF-401-Vendor-Data-Sheet.pdf"');
      return res.send(Buffer.from(bytes));
    } catch (error) {
      console.error("Build vendor template failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to build the data sheet." });
    }
  });

  router.post("/interceptors/:id/vendor-sheet", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    const upload = decodeUpload(req.body?.data);
    if (upload.error) {
      return res.status(400).json({ success: false, error: upload.error });
    }
    try {
      const system = await pool.query("SELECT profile FROM interceptors WHERE id=$1", [id]);
      if (system.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Interceptor not found." });
      }
      const sheet = await readTemplatePdf(upload.bytes);
      if (!sheet.ok) {
        return res.status(400).json({ success: false, error: sheet.error });
      }
      const stored = await pool.query(
        `INSERT INTO vendor_documents (interceptor_id, filename, pdf, meta, sheet_values, rejected)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [id, asText(req.body?.filename, 200), upload.bytes, JSON.stringify(sheet.meta), JSON.stringify(sheet.values), JSON.stringify(sheet.rejected)]
      );
      return res.json({
        success: true,
        documentId: Number(stored.rows[0].id),
        meta: sheet.meta,
        rejected: sheet.rejected,
        ...summarize(system.rows[0].profile || {}, sheet.values, sheet.rejected),
      });
    } catch (error) {
      console.error("Read vendor sheet failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to read the data sheet." });
    }
  });

  router.post("/vendor-documents/:id/apply", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const outcome = await applyDocument(pool, id);
      if (outcome.notFound) {
        return res.status(404).json({ success: false, error: "Data sheet not found." });
      }
      if (outcome.alreadyApplied) {
        return res.status(409).json({ success: false, error: "This data sheet has already been applied." });
      }
      return res.json({ success: true, written: outcome.written });
    } catch (error) {
      console.error("Apply vendor sheet failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to apply the data sheet." });
    }
  });

  router.get("/interceptors/:id/vendor-documents", requireRole("admin"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query(
        `SELECT id, interceptor_id, filename, meta, sheet_values, rejected, status, created_at, applied_at
         FROM vendor_documents WHERE interceptor_id=$1 ORDER BY created_at DESC`,
        [id]
      );
      return res.json({ success: true, documents: result.rows.map(documentToApi) });
    } catch (error) {
      console.error("List vendor sheets failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to list data sheets." });
    }
  });

  router.get("/vendor-documents/:id/pdf", requireRole("scorer"), async (req, res) => {
    const id = asId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "Valid id is required." });
    }
    try {
      const result = await pool.query("SELECT filename, pdf FROM vendor_documents WHERE id=$1", [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Data sheet not found." });
      }
      const name = (result.rows[0].filename || `vendor-sheet-${id}.pdf`).replace(/[^A-Za-z0-9._-]/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      return res.send(result.rows[0].pdf);
    } catch (error) {
      console.error("Download vendor sheet failed:", error?.message);
      return res.status(500).json({ success: false, error: "Failed to load the data sheet." });
    }
  });

  return router;
}
