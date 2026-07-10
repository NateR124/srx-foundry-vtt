/**
 * FormDataExtended turns a cleared <input type="number"> into null, which a
 * non-nullable NumberField then rejects — failing the whole submitOnChange
 * update. Restore the document's current value for such paths.
 *
 * Nullable number fields must be skipped so users can still clear them; list
 * them by path suffix (revisit if the schemas grow more nullable numbers).
 */
const NULLABLE_SUFFIX = /\.(dvMin|dvMax|level)$/;

export function restoreNullNumbers(doc, data) {
  const flat = foundry.utils.flattenObject(data);
  for (const [path, value] of Object.entries(flat)) {
    if (value !== null || NULLABLE_SUFFIX.test(path)) continue;
    const current = foundry.utils.getProperty(doc, path);
    if (typeof current === "number") foundry.utils.setProperty(data, path, current);
  }
  return data;
}
