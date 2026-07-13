/*
 * Site-wide look customization: accent/background/rarity colors + effect toggles.
 * data/theme.json is the published source of truth (like data/items.json) —
 * every visitor gets the same look. The admin screen edits a draft copy in
 * IndexedDB and must be exported to data/theme.json to go live, see admin.js.
 */
(function (global) {
  const DEFAULT_THEME = {
    accent: '#ff7ac6',
    accent2: '#7ad7ff',
    bg0: '#120a20',
    bg1: '#1d1236',
    bg2: '#2a1a45',
    rarity: { N: '#9aa0a6', R: '#4fc3f7', SR: '#c084fc', SSR: '#ffd54f' },
    effects: { packShine: true, burstFlash: true, ssrHolo: true, reducedMotion: false },
  };

  function mergeWithDefaults(partial) {
    const src = partial && typeof partial === 'object' ? partial : {};
    return {
      accent: src.accent || DEFAULT_THEME.accent,
      accent2: src.accent2 || DEFAULT_THEME.accent2,
      bg0: src.bg0 || DEFAULT_THEME.bg0,
      bg1: src.bg1 || DEFAULT_THEME.bg1,
      bg2: src.bg2 || DEFAULT_THEME.bg2,
      rarity: { ...DEFAULT_THEME.rarity, ...(src.rarity || {}) },
      effects: { ...DEFAULT_THEME.effects, ...(src.effects || {}) },
    };
  }

  async function loadPublishedTheme() {
    try {
      const res = await fetch('data/theme.json', { cache: 'no-cache' });
      if (!res.ok) return { ...DEFAULT_THEME };
      const data = await res.json();
      return mergeWithDefaults(data);
    } catch (err) {
      return { ...DEFAULT_THEME };
    }
  }

  function applyTheme(theme) {
    const t = mergeWithDefaults(theme);
    const root = document.documentElement;
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-2', t.accent2);
    root.style.setProperty('--bg-0', t.bg0);
    root.style.setProperty('--bg-1', t.bg1);
    root.style.setProperty('--bg-2', t.bg2);
    root.style.setProperty('--rarity-N', t.rarity.N);
    root.style.setProperty('--rarity-R', t.rarity.R);
    root.style.setProperty('--rarity-SR', t.rarity.SR);
    root.style.setProperty('--rarity-SSR', t.rarity.SSR);

    if (global.GachaRarity) {
      Object.keys(t.rarity).forEach((key) => {
        if (global.GachaRarity.RARITY[key]) global.GachaRarity.RARITY[key].color = t.rarity[key];
      });
    }

    document.body.classList.toggle('fx-pack-shine-off', !t.effects.packShine);
    document.body.classList.toggle('fx-burst-off', !t.effects.burstFlash);
    document.body.classList.toggle('fx-holo-off', !t.effects.ssrHolo);
    document.body.classList.toggle('fx-reduced-motion', !!t.effects.reducedMotion);
    return t;
  }

  async function initPublished() {
    const theme = await loadPublishedTheme();
    applyTheme(theme);
    return theme;
  }

  global.GachaTheme = { DEFAULT_THEME, mergeWithDefaults, loadPublishedTheme, applyTheme, initPublished };
})(window);
