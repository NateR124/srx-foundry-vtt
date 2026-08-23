/**
 * Talent catalog shared by the chargen wizard and the advancement panel.
 *
 * Since 1.0.0 the full catalog ships in the `srx.talents` compendium, so the
 * talent pickers read from the pack. World talent items (homebrew, or a
 * catalog imported in the pre-1.0 bring-your-own-data era) are merged in and
 * win on name collision, so a table's customized version overrides the
 * shipped one.
 *
 * The picker list is built from the pack INDEX — the metadata it shows (name,
 * karma, category) is all indexable, so the 500+ full documents are never
 * fetched up front; only a talent actually bought/committed is loaded.
 *
 * The pack contains duplicate-named docs (the catalog TSV lists some talents
 * under several subheadings, and the import kept one doc per appearance —
 * e.g. Initiation ×4, identical karma). The picker collapses those to one
 * entry per name: 517 docs → 500 choices.
 */

const PACK_ID = "srx.talents";

/** @type {Promise<object[]>|null} pack contents are static per session — index once. */
let packIndex = null;

/** id → catalog entry served by the last load; pickers resolve through this. */
const entries = new Map();

/**
 * Load the merged talent catalog, sorted by name.
 * @returns {Promise<{id: string, name: string, karma: number, category: string, fromPack: boolean}[]>}
 */
export async function loadTalentCatalog() {
  packIndex ??= game.packs?.get?.(PACK_ID)?.getIndex({ fields: ["system.karma", "system.category"] })
    .catch((err) => {
      console.error(`SRX | failed to index ${PACK_ID}`, err);
      return [];
    }) ?? Promise.resolve([]);
  const index = await packIndex;
  const byName = new Map();
  for (const e of index) {
    if (e.type !== "talent" || byName.has(e.name)) continue; // first doc per name wins
    byName.set(e.name, {
      id: e._id, name: e.name,
      karma: e.system?.karma ?? 0,
      category: e.system?.category ?? "general",
      fromPack: true
    });
  }
  for (const i of game.items?.filter?.((i) => i.type === "talent") ?? []) {
    byName.set(i.name, {
      id: i.id, name: i.name,
      karma: i.system?.karma ?? 0,
      category: i.system?.category ?? "general",
      fromPack: false
    });
  }
  const catalog = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  entries.clear();
  for (const e of catalog) entries.set(e.id, e);
  return catalog;
}

/**
 * Synchronous metadata for a talent picked from a catalog list.
 * @param {string} id
 * @returns {{id: string, name: string, karma: number, category: string, fromPack: boolean}|null}
 */
export function getTalentEntry(id) {
  return entries.get(id) ?? null;
}

/**
 * Fetch the full Item document for a picked talent (pack or world).
 * @param {string} id
 * @returns {Promise<Item|null>}
 */
export async function getTalentDoc(id) {
  const entry = entries.get(id);
  if (entry?.fromPack) return (await game.packs?.get?.(PACK_ID)?.getDocument(id)) ?? null;
  return game.items?.get?.(id) ?? null;
}

/**
 * Wire the name filter above a talent list. Filtering hides rows in place —
 * no re-render — and the caller holds the current query so it survives the
 * re-renders that picking a talent triggers.
 *
 * @param {HTMLElement|null} root - the app's element.
 * @param {string} initial - the query to restore.
 * @param {(value: string) => void} store - called with the query on each edit.
 */
export function wireTalentFilter(root, initial, store) {
  const input = root?.querySelector?.("input[name='talentFilter']");
  if (!input) return;
  input.value = initial;
  const apply = () => {
    store(input.value);
    const q = input.value.trim().toLowerCase();
    for (const row of root.querySelectorAll(".talent-list > *")) {
      const name = row.querySelector(".t-name")?.textContent ?? "";
      row.hidden = !!q && !name.toLowerCase().includes(q);
    }
  };
  input.addEventListener("input", apply);
  apply();
}
