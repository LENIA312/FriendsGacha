/*
 * Loads the published item catalog from data/items.json.
 * This file is the single source of truth for what appears in the gacha on
 * the deployed (GitHub Pages) site — every visitor fetches the same JSON.
 * Player-specific data (which items they've obtained) stays in IndexedDB,
 * see db.js.
 */
(function (global) {
  let cache = null;

  async function loadCatalog(force) {
    if (cache && !force) return cache;
    const res = await fetch('data/items.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`data/items.json の取得に失敗しました (HTTP ${res.status})`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('data/items.json の形式が不正です(配列ではありません)');
    cache = items;
    return cache;
  }

  global.GachaCatalog = { loadCatalog };
})(window);
