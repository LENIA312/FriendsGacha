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
  const MIN_INTERVAL_MS = 100; // 製造速度Lv上限付近での最短生産間隔(0.1秒)
  const SPEED_FACTOR = 0.85; // each speedLevel: interval *= 0.85 (下限はMIN_INTERVAL_MSでクランプ)
  const AMOUNT_TABLE = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000,
    2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000, 1000000,
  ];
  const CRIT_CHANCE = 0.05;
  const CRIT_MULT = 3;
  const MAME_CAP = 999999999;
  const NAZO_CAP = 9999;
  const MAME_TO_NAZO_RATE = 1000000;

  // Lvの上限。amount/tapは表の最終値・最終倍率(docs/Balance.md)にちょうど到達するレベルで打ち止め。
  const MAX_LEVEL = { speed: 50, amount: AMOUNT_TABLE.length - 1, line: 19, tap: 9 };

  const UPGRADES = {
    speed: { base: 15, growth: 1.35, label: '製造速度' },
    amount: { base: 25, growth: 2, label: '一度に生産する量' },
    line: { base: 150, growth: 2, label: '並列生産ライン' },
    tap: { base: 20, growth: 1.8, label: 'タップの効果' },
  };

  const els = {};
  let state = null;
  let tickTimer = null;
  let saveTimer = null;

  function defaultState() {
    return {
      balance: 0,
      nazoMame: 0,
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
      nazoMame: typeof s.nazoMame === 'number' ? s.nazoMame : 0,
      lastTick: typeof s.lastTick === 'number' ? s.lastTick : Date.now(),
      lines,
      upgrades,
    };
  }

  function intervalMs() {
    return Math.max(MIN_INTERVAL_MS, BASE_INTERVAL_MS * Math.pow(SPEED_FACTOR, state.upgrades.speedLevel));
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

  function isMaxed(type) {
    return state.upgrades[type + 'Level'] >= MAX_LEVEL[type];
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

  function showToast(text) {
    if (!els.toastHost) return;
    const toast = document.createElement('div');
    toast.className = 'mame-toast';
    toast.textContent = text;
    els.toastHost.appendChild(toast);
    setTimeout(() => toast.remove(), 1400);
  }

  function isFull() {
    return state.balance >= MAME_CAP;
  }

  // Advances a single line by `deltaMs`, crediting completions to balance.
  // `allowCrit` is false for offline catch-up so reloading the page can't be used to farm crit rolls.
  // Production pauses entirely once the マメ cap is hit (progress freezes rather than being wasted),
  // and resumes on its own the next time balance drops below the cap (e.g. spending on a draw/upgrade).
  function advanceLine(line, deltaMs, allowCrit) {
    if (isFull()) return;
    const interval = intervalMs();
    line.progressMs += deltaMs;
    while (line.progressMs >= interval) {
      if (isFull()) break;
      line.progressMs -= interval;
      const baseAmount = amountPerCompletion();
      let amount = baseAmount;
      if (allowCrit && Math.random() < CRIT_CHANCE) {
        amount *= CRIT_MULT;
        showToast(`✨ Critical! +${fmt(amount - baseAmount)}`);
      }
      state.balance = Math.min(MAME_CAP, state.balance + amount);
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
    if (isMaxed(type)) return;
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
    if (!state || state.balance < amount) return false;
    state.balance -= amount;
    render();
    persistNow();
    return true;
  }

  function spendNazo(amount) {
    if (!state || state.nazoMame < amount) return false;
    state.nazoMame -= amount;
    render();
    persistNow();
    return true;
  }

  function exchangeNazo() {
    if (!state || state.balance < MAME_TO_NAZO_RATE || state.nazoMame >= NAZO_CAP) return false;
    state.balance -= MAME_TO_NAZO_RATE;
    state.nazoMame = Math.min(NAZO_CAP, state.nazoMame + 1);
    showToast('🔮 ナゾマメ +1');
    render();
    persistNow();
    return true;
  }

  function getBalance() {
    return state ? state.balance : 0;
  }

  function getNazoBalance() {
    return state ? state.nazoMame : 0;
  }

  function renderBadge() {
    if (els.badge) els.badge.textContent = `🫘 ${fmt(state.balance)}`;
    const nazoText = `🔮 ${fmt(state.nazoMame)}`;
    if (els.nazoBadgeHeader) els.nazoBadgeHeader.textContent = nazoText;
    if (els.nazoBadgeWorkshop) els.nazoBadgeWorkshop.textContent = nazoText;
  }

  function renderExchange() {
    if (!els.exchangeBtn) return;
    els.exchangeBtn.disabled = state.balance < MAME_TO_NAZO_RATE || state.nazoMame >= NAZO_CAP;
  }

  function renderHint() {
    if (!els.hint) return;
    els.hint.textContent = isFull()
      ? 'マメが上限に達したため製造を停止中(使うと再開します)'
      : 'タップして製造を早めよう';
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
      const level = state.upgrades[type + 'Level'];
      const card = els.upgrades.querySelector(`[data-upgrade="${type}"]`);
      if (!card) return;
      card.querySelector('.upgrade-level').textContent = `Lv.${level}`;
      const maxed = isMaxed(type);
      card.classList.toggle('maxed', maxed);
      if (maxed) {
        card.querySelector('.upgrade-cost').textContent = 'MAX';
        card.querySelector('button').disabled = true;
      } else {
        const cost = upgradeCost(type);
        card.querySelector('.upgrade-cost').textContent = `🫘 ${fmt(cost)}`;
        card.querySelector('button').disabled = state.balance < cost;
      }
    });
  }

  function render() {
    renderBadge();
    renderLines();
    renderUpgrades();
    renderExchange();
    renderHint();
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
    els.nazoBadgeHeader = document.getElementById('nazoBadgeHeader');
    els.nazoBadgeWorkshop = document.getElementById('nazoBadgeWorkshop');
    els.exchangeBtn = document.getElementById('nazoExchangeBtn');
    els.hint = document.getElementById('mameHint');

    if (els.upgrades) {
      Object.keys(UPGRADES).forEach((type) => els.upgrades.appendChild(buildUpgradeCard(type)));
    }
    if (els.exchangeBtn) {
      els.exchangeBtn.addEventListener('click', exchangeNazo);
    }

    window.addEventListener('beforeunload', persistNow);

    render();
    tickTimer = setInterval(tick, TICK_MS);
  }

  global.GachaMame = { init, getBalance, spend, getNazoBalance, spendNazo, fmt };
})(window);
