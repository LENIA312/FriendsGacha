/*
 * "マメ工房" — idle bean(マメ) production that funds gacha draws.
 * State (balance / production progress / upgrades) is player-specific data,
 * stored in IndexedDB via GachaDB.SettingsStore under the key 'mame'
 * (same get/put pattern js/admin.js uses for the 'theme' key).
 */
(function (global) {
  const STORAGE_KEY = 'mame';
  const TICK_MS = 150;
  const SAVE_DEBOUNCE_MS = 2000;

  const BASE_INTERVAL_MS = 5000;
  const SPEED_FACTOR = 0.85; // each speedLevel: interval *= 0.85
  const AMOUNT_TABLE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const CRIT_CHANCE = 0.05;
  const CRIT_MULT = 3;

  const UPGRADES = {
    speed: { base: 15, growth: 1.5, label: '製造速度' },
    amount: { base: 25, growth: 2, label: '一度に生産する量' },
    line: { base: 150, growth: 3, label: '並列生産ライン' },
    tap: { base: 20, growth: 1.8, label: 'タップの効果' },
  };

  const els = {};
  let state = null;
  let tickTimer = null;
  let saveTimer = null;

  function defaultState() {
    return {
      balance: 0,
      lastTick: Date.now(),
      lines: [{ progressMs: 0 }],
      upgrades: { speedLevel: 0, amountLevel: 0, lineLevel: 0, tapLevel: 0 },
    };
  }

  function mergeState(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const base = defaultState();
    const upgrades = { ...base.upgrades, ...(s.upgrades || {}) };
    const lineCount = 1 + upgrades.lineLevel;
    const lines = Array.isArray(s.lines) && s.lines.length ? s.lines.slice(0, lineCount) : [];
    while (lines.length < lineCount) lines.push({ progressMs: 0 });
    return {
      balance: typeof s.balance === 'number' ? s.balance : 0,
      lastTick: typeof s.lastTick === 'number' ? s.lastTick : Date.now(),
      lines,
      upgrades,
    };
  }

  function intervalMs() {
    return BASE_INTERVAL_MS * Math.pow(SPEED_FACTOR, state.upgrades.speedLevel);
  }

  function amountPerCompletion() {
    const idx = state.upgrades.amountLevel;
    if (idx < AMOUNT_TABLE.length) return AMOUNT_TABLE[idx];
    const extra = idx - (AMOUNT_TABLE.length - 1);
    return AMOUNT_TABLE[AMOUNT_TABLE.length - 1] * Math.pow(2, extra);
  }

  function tapDivisor() {
    return 2 + state.upgrades.tapLevel;
  }

  function upgradeCost(type) {
    const cfg = UPGRADES[type];
    const level = state.upgrades[type + 'Level'];
    return Math.ceil(cfg.base * Math.pow(cfg.growth, level));
  }

  function fmt(n) {
    return Math.floor(n).toLocaleString('ja-JP');
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, SAVE_DEBOUNCE_MS);
  }

  async function persistNow() {
    clearTimeout(saveTimer);
    await GachaDB.SettingsStore.put(STORAGE_KEY, state);
  }

  function showCriticalToast() {
    if (!els.toastHost) return;
    const toast = document.createElement('div');
    toast.className = 'mame-toast';
    toast.textContent = `✨ Critical! +${fmt(amountPerCompletion() * (CRIT_MULT - 1))}`;
    els.toastHost.appendChild(toast);
    setTimeout(() => toast.remove(), 1400);
  }

  // Advances a single line by `deltaMs`, crediting completions to balance.
  // `allowCrit` is false for offline catch-up so reloading the page can't be used to farm crit rolls.
  function advanceLine(line, deltaMs, allowCrit) {
    const interval = intervalMs();
    line.progressMs += deltaMs;
    while (line.progressMs >= interval) {
      line.progressMs -= interval;
      let amount = amountPerCompletion();
      if (allowCrit && Math.random() < CRIT_CHANCE) {
        amount *= CRIT_MULT;
        showCriticalToast();
      }
      state.balance += amount;
    }
  }

  function applyOfflineProgress() {
    const now = Date.now();
    const elapsed = Math.max(0, now - state.lastTick);
    if (elapsed > 0) {
      state.lines.forEach((line) => advanceLine(line, elapsed, false));
    }
    state.lastTick = now;
  }

  function tick() {
    const now = Date.now();
    const delta = now - state.lastTick;
    state.lastTick = now;
    state.lines.forEach((line) => advanceLine(line, delta, true));
    render();
    schedulePersist();
  }

  function tap(lineIndex) {
    const line = state.lines[lineIndex];
    if (!line) return;
    const interval = intervalMs();
    const remaining = interval - line.progressMs;
    line.progressMs = interval - remaining / tapDivisor();
    render();
    schedulePersist();
  }

  function buyUpgrade(type) {
    const cost = upgradeCost(type);
    if (state.balance < cost) return;
    state.balance -= cost;
    state.upgrades[type + 'Level'] += 1;
    if (type === 'line') {
      state.lines.push({ progressMs: 0 });
    }
    render();
    persistNow();
  }

  function spend(amount) {
    if (state.balance < amount) return false;
    state.balance -= amount;
    render();
    persistNow();
    return true;
  }

  function getBalance() {
    return state.balance;
  }

  function renderBadge() {
    if (els.badge) els.badge.textContent = `🫘 ${fmt(state.balance)}`;
  }

  function renderLines() {
    if (!els.lines) return;
    const interval = intervalMs();
    if (els.lines.children.length !== state.lines.length) {
      els.lines.innerHTML = '';
      state.lines.forEach((_, i) => {
        const row = document.createElement('div');
        row.className = 'production-line';
        row.innerHTML = `
          <div class="production-bar-track">
            <div class="production-bar-fill"></div>
          </div>
          <span class="production-line-label">ライン${i + 1}</span>`;
        row.addEventListener('click', () => tap(i));
        els.lines.appendChild(row);
      });
    }
    state.lines.forEach((line, i) => {
      const row = els.lines.children[i];
      const fill = row.querySelector('.production-bar-fill');
      const pct = Math.min(100, (line.progressMs / interval) * 100);
      fill.style.width = pct + '%';
    });
  }

  function renderUpgrades() {
    if (!els.upgrades) return;
    Object.keys(UPGRADES).forEach((type) => {
      const cost = upgradeCost(type);
      const level = state.upgrades[type + 'Level'];
      const card = els.upgrades.querySelector(`[data-upgrade="${type}"]`);
      if (!card) return;
      card.querySelector('.upgrade-level').textContent = `Lv.${level}`;
      card.querySelector('.upgrade-cost').textContent = `🫘 ${fmt(cost)}`;
      card.querySelector('button').disabled = state.balance < cost;
    });
  }

  function render() {
    renderBadge();
    renderLines();
    renderUpgrades();
    if (global.GachaPlay && global.GachaPlay.refreshDrawButtons) {
      global.GachaPlay.refreshDrawButtons();
    }
  }

  function buildUpgradeCard(type) {
    const cfg = UPGRADES[type];
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.dataset.upgrade = type;
    card.innerHTML = `
      <div class="upgrade-name">${cfg.label}</div>
      <div class="upgrade-level">Lv.0</div>
      <div class="upgrade-cost">🫘 0</div>
      <button class="btn secondary">強化</button>`;
    card.querySelector('button').addEventListener('click', () => buyUpgrade(type));
    return card;
  }

  async function init() {
    const saved = await GachaDB.SettingsStore.get(STORAGE_KEY);
    state = mergeState(saved);
    applyOfflineProgress();
    await persistNow();

    els.badge = document.getElementById('mameBadge');
    els.lines = document.getElementById('mameLines');
    els.upgrades = document.getElementById('mameUpgrades');
    els.toastHost = document.getElementById('mameToastHost');

    if (els.upgrades) {
      Object.keys(UPGRADES).forEach((type) => els.upgrades.appendChild(buildUpgradeCard(type)));
    }

    window.addEventListener('beforeunload', persistNow);

    render();
    tickTimer = setInterval(tick, TICK_MS);
  }

  global.GachaMame = { init, getBalance, spend, fmt };
})(window);
