/*
 * Rarity definitions shared by the gacha, collection and admin screens.
 * Edit `weight` to change the drop rates (they don't need to sum to 100,
 * they are normalised automatically).
 */
(function (global) {
  const RARITY_ORDER = ['N', 'R', 'SR', 'SSR'];

  const RARITY = {
    N: { key: 'N', name: 'ノーマル', weight: 80, order: 1, color: '#9aa0a6', glow: 'none' },
    R: { key: 'R', name: 'レア', weight: 18, order: 2, color: '#4fc3f7', glow: 'soft' },
    SR: { key: 'SR', name: 'スーパーレア', weight: 1.8, order: 3, color: '#c084fc', glow: 'strong' },
    SSR: { key: 'SSR', name: 'スーパースペシャルレア', weight: 0.2, order: 4, color: '#ffd54f', glow: 'holo' },
  };

  function info(key) {
    return RARITY[key] || RARITY.N;
  }

  // Weighted random pick among the rarities that actually have >=1 item in the catalog.
  function pickRarity(availableRarities) {
    const pool = RARITY_ORDER.filter((r) => availableRarities.includes(r));
    if (pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, r) => sum + RARITY[r].weight, 0);
    let roll = Math.random() * totalWeight;
    for (const r of pool) {
      roll -= RARITY[r].weight;
      if (roll <= 0) return r;
    }
    return pool[pool.length - 1];
  }

  // Weighted random pick from an arbitrary {rarityKey: weight} map (e.g. the ナゾマメガチャ's
  // R/SR/SSR-only odds), restricted to the rarities actually present in `availableRarities`.
  function pickWeighted(availableRarities, weightMap) {
    const pool = availableRarities.filter((r) => weightMap[r] > 0);
    if (pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, r) => sum + weightMap[r], 0);
    let roll = Math.random() * totalWeight;
    for (const r of pool) {
      roll -= weightMap[r];
      if (roll <= 0) return r;
    }
    return pool[pool.length - 1];
  }

  global.GachaRarity = { RARITY, RARITY_ORDER, info, pickRarity, pickWeighted };
})(window);
