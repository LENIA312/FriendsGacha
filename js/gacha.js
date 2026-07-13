/*
 * Pack-opening gacha animation + weighted draw logic.
 */
(function (global) {
  const els = {};
  const state = {
    busy: false,
    pendingResults: null, // [{item, isNew}]
    skip: false,
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, state.skip ? Math.min(ms, 16) : ms));
  }

  function drawItems(catalog, count) {
    const byRarity = {};
    catalog.forEach((item) => {
      (byRarity[item.rarity] = byRarity[item.rarity] || []).push(item);
    });
    const availableRarities = Object.keys(byRarity);
    const picks = [];
    for (let i = 0; i < count; i++) {
      const rarity = GachaRarity.pickRarity(availableRarities);
      const pool = byRarity[rarity] || catalog;
      picks.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return picks;
  }

  function setDrawButtonsVisible(visible) {
    els.drawOneBtn.classList.toggle('hidden', !visible);
    // 10連は一旦導線を非表示にしているため、常にhiddenのまま(ロジックは維持)
    // els.drawTenBtn.classList.toggle('hidden', !visible);
  }

  function resetStage() {
    els.pack.classList.remove('tearing', 'hidden');
    els.cardsArea.classList.add('hidden');
    els.cardsArea.classList.remove('single');
    els.cardsArea.innerHTML = '';
    els.burst.classList.remove('play');
    els.skipBtn.classList.add('hidden');
    els.resetDrawBtn.classList.add('hidden');
    setDrawButtonsVisible(true);
    els.hint.textContent = 'パックをタップして開封しよう';
    state.pendingResults = null;
    state.skip = false;
  }

  async function handleDrawClick(count) {
    if (state.busy) return;
    let catalog;
    try {
      catalog = await GachaCatalog.loadCatalog();
    } catch (err) {
      alert('カタログの読み込みに失敗しました: ' + err.message);
      return;
    }
    if (catalog.length === 0) {
      alert('まだアイテムが登録されていません。data/items.json にアイテムを追加してください。');
      return;
    }
    state.busy = true;
    setDrawButtonsVisible(false);
    els.hint.textContent = 'パックをタップして開封しよう';

    const picks = drawItems(catalog, count);
    const results = [];
    for (const item of picks) {
      const isNew = await GachaDB.CollectionStore.recordObtain(item.id);
      results.push({ item, isNew });
    }
    state.pendingResults = results;
  }

  function createCardEl(result) {
    const rarity = GachaRarity.info(result.item.rarity);
    const el = document.createElement('div');
    el.className = `seal-card fx-${rarity.glow}`;
    el.style.setProperty('--rc', rarity.color);
    el.innerHTML = `
      <div class="seal-card-inner">
        <div class="seal-card-face seal-card-back"></div>
        <div class="seal-card-face seal-card-front">
          <div class="seal-card-image" style="background-image:url('${result.item.image}')">
            <span class="seal-card-badge">${rarity.key}</span>
            ${result.isNew ? '<span class="seal-card-new">NEW</span>' : ''}
          </div>
          <div class="seal-card-name">${escapeHtml(result.item.name)}</div>
        </div>
      </div>`;
    el.addEventListener('click', () => {
      if (el.classList.contains('revealed') && global.GachaMain) {
        global.GachaMain.openItemModal(result.item);
      }
    });
    return el;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function playOpenSequence() {
    const results = state.pendingResults;
    if (!results) return;
    state.pendingResults = null;

    // tear the pack open
    els.pack.classList.add('tearing');
    els.burst.classList.remove('play');
    void els.burst.offsetWidth; // restart animation
    els.burst.classList.add('play');
    els.skipBtn.classList.remove('hidden');

    await sleep(500);
    els.pack.classList.add('hidden');

    const isSingle = results.length === 1;
    els.cardsArea.classList.toggle('single', isSingle);
    els.cardsArea.classList.remove('hidden');

    const cardEls = results.map(createCardEl);
    cardEls.forEach((el) => els.cardsArea.appendChild(el));

    for (let i = 0; i < cardEls.length; i++) {
      await sleep(i === 0 ? 80 : 150);
      if (state.skip) cardEls[i].style.transition = 'none';
      cardEls[i].classList.add('enter');
    }

    await sleep(350);

    for (let i = 0; i < cardEls.length; i++) {
      await sleep(i === 0 ? 0 : 110);
      const inner = cardEls[i].querySelector('.seal-card-inner');
      if (state.skip && inner) inner.style.transition = 'none';
      cardEls[i].classList.add('flipped', 'revealed');
    }

    await sleep(300);

    els.skipBtn.classList.add('hidden');
    els.resetDrawBtn.classList.remove('hidden');
    els.hint.textContent = 'カードをタップすると詳細が見られます';
    state.busy = false;
    if (global.GachaMain) global.GachaMain.refreshCollectionSoon();
  }

  function initGacha() {
    els.pack = document.getElementById('pack');
    els.burst = document.getElementById('burst');
    els.cardsArea = document.getElementById('cardsArea');
    els.drawOneBtn = document.getElementById('drawOneBtn');
    els.drawTenBtn = document.getElementById('drawTenBtn');
    els.skipBtn = document.getElementById('skipBtn');
    els.resetDrawBtn = document.getElementById('resetDrawBtn');
    els.hint = document.querySelector('.gacha-hint');

    els.drawOneBtn.addEventListener('click', () => handleDrawClick(1));
    els.drawTenBtn.addEventListener('click', () => handleDrawClick(10));
    els.pack.addEventListener('click', () => {
      if (state.pendingResults) playOpenSequence();
    });
    els.skipBtn.addEventListener('click', () => {
      state.skip = true;
    });
    els.resetDrawBtn.addEventListener('click', resetStage);

    resetStage();
  }

  global.GachaPlay = { initGacha };
})(window);
