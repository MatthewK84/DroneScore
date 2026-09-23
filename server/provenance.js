/**
 * Where each system profile value came from.
 *
 * A value imported from a vendor data sheet is the vendor's declaration,
 * and for a performance claim that decides whether it may score. So the
 * provenance has to stay true as the profile changes: an import labels
 * what it wrote, and an evaluator who later edits a value takes it over,
 * because the value is now theirs.
 *
 * Everything here is pure. The routes read the stored profile, call these,
 * and write back what they return.
 */

/** Provenance tag for values written by a vendor data sheet import. */
export const VENDOR_SHEET = "vendor-sheet";

/**
 * Keeps provenance only for values an edit left untouched. A value the
 * evaluator changed, or cleared, is no longer the vendor's.
 *
 * @param {object} before Profile before the edit.
 * @param {object} after Profile after the edit.
 * @param {object} sources Provenance before the edit.
 * @returns {object} Provenance after the edit.
 */
export function retainSources(before, after, sources) {
  const kept = {};
  for (const [key, source] of Object.entries(sources || {})) {
    if (Object.hasOwn(after, key) && String(after[key]) === String(before?.[key])) {
      kept[key] = source;
    }
  }
  return kept;
}

/**
 * What importing a sheet would do to a profile, value by value.
 *
 * @param {object} profile Current profile.
 * @param {object} values Values read from the sheet.
 * @returns {{ key: string, before: string | null, after: string, status: "new" | "changed" | "unchanged" }[]}
 */
export function diffSheet(profile, values) {
  return Object.entries(values).map(([key, after]) => {
    const before = Object.hasOwn(profile || {}, key) ? String(profile[key]) : null;
    let status = "changed";
    if (before === null) {
      status = "new";
    } else if (before === after) {
      status = "unchanged";
    }
    return { key, before, after, status };
  });
}

/**
 * Applies an imported sheet. New and changed values are written and
 * labelled as the vendor's; a value the sheet repeats unchanged keeps its
 * existing provenance, so an evaluator's entry is never relabelled as the
 * vendor's just because the vendor agreed with it.
 *
 * @param {object} profile Current profile.
 * @param {object} sources Current provenance.
 * @param {object} values Values read from the sheet.
 * @param {{ documentId: number, importedAt: string }} origin
 * @returns {{ profile: object, sources: object, written: number }}
 */
export function applySheet(profile, sources, values, origin) {
  const nextProfile = { ...(profile || {}) };
  const nextSources = { ...(sources || {}) };
  let written = 0;
  for (const change of diffSheet(profile, values)) {
    if (change.status === "unchanged") {
      continue;
    }
    nextProfile[change.key] = change.after;
    nextSources[change.key] = { source: VENDOR_SHEET, documentId: origin.documentId, importedAt: origin.importedAt };
    written += 1;
  }
  return { profile: nextProfile, sources: nextSources, written };
}

/** @returns {boolean} True when a profile value came from a vendor data sheet. */
export function isVendorDeclared(sources, key) {
  return sources?.[key]?.source === VENDOR_SHEET;
}
