/*
 * Admin screen: CRUD for the item catalog + JSON export/import + collection reset.
 */
(function () {
  const els = {};
  let editingId = null;
  let selectedImageDataUrl = null;

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function populateRaritySelect() {
    els.rarity.innerHTML = GachaRarity.RARITY_ORDER
      .map((key) => `<option value="${key}">${key} - ${GachaRarity.RARITY[key].name}</option>`)
      .join('');
  }

  function resetForm() {
    editingId = null;
    selectedImageDataUrl = null;
    els.form.reset();
    els.itemId.value = '';
    els.imagePreview.style.backgroundImage = 'none';
    els.imagePreview.classList.remove('has-image');
    els.imagePreview.textContent = 'プレビュー';
    els.formHeading.textContent = '新しいイラストを追加';
    els.submitBtn.textContent = '追加する';
    els.cancelEditBtn.classList.add('hidden');
  }

  async function renderList() {
    const items = await GachaDB.ItemsStore.all();
    els.itemCount.textContent = `全 ${items.length} 件`;

    if (items.length === 0) {
      els.list.innerHTML = '<p class="empty-state">まだ登録されていません。上のフォームから追加してください。</p>';
      return;
    }

    const sorted = items.slice().sort((a, b) => {
      const ra = GachaRarity.info(a.rarity).order;
      const rb = GachaRarity.info(b.rarity).order;
      if (rb !== ra) return rb - ra;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    els.list.innerHTML = '';
    sorted.forEach((item) => {
      const rarity = GachaRarity.info(item.rarity);
      const row = document.createElement('div');
      row.className = 'item-row';
      row.style.setProperty('--rc', rarity.color);
      row.innerHTML = `
        <div class="item-row-thumb" style="background-image:url('${item.image}')"></div>
        <div class="item-row-info">
          <div class="item-row-name"><span class="item-row-badge">${rarity.key}</span>${escapeHtml(item.name)}</div>
          <div class="item-row-meta">作者: ${escapeHtml(item.author || '不明')}</div>
        </div>
        <div class="item-row-actions">
          <button class="icon-btn" data-action="edit" data-id="${item.id}">編集</button>
          <button class="icon-btn danger" data-action="delete" data-id="${item.id}">削除</button>
        </div>`;
      els.list.appendChild(row);
    });
  }

  async function startEdit(id) {
    const item = await GachaDB.ItemsStore.get(id);
    if (!item) return;
    editingId = id;
    selectedImageDataUrl = item.image;
    els.itemId.value = id;
    els.name.value = item.name;
    els.rarity.value = item.rarity;
    els.author.value = item.author || '';
    els.flavor.value = item.flavorText || '';
    els.imagePreview.style.backgroundImage = `url('${item.image}')`;
    els.imagePreview.classList.add('has-image');
    els.imagePreview.textContent = '';
    els.imageInput.value = '';
    els.formHeading.textContent = `「${item.name}」を編集中`;
    els.submitBtn.textContent = '更新する';
    els.cancelEditBtn.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteItem(id) {
    const item = await GachaDB.ItemsStore.get(id);
    const label = item ? item.name : 'このアイテム';
    if (!confirm(`「${label}」をカタログから削除しますか？(所持記録は残ります)`)) return;
    await GachaDB.ItemsStore.remove(id);
    if (editingId === id) resetForm();
    renderList();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = els.name.value.trim();
    const rarity = els.rarity.value;
    const author = els.author.value.trim();
    const flavorText = els.flavor.value.trim();

    if (!name) {
      alert('名前を入力してください。');
      return;
    }
    if (!selectedImageDataUrl) {
      alert('イラスト画像を選択してください。');
      return;
    }

    const item = {
      id: editingId || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      rarity,
      author,
      flavorText,
      image: selectedImageDataUrl,
      createdAt: Date.now(),
    };
    if (editingId) {
      const prev = await GachaDB.ItemsStore.get(editingId);
      if (prev) item.createdAt = prev.createdAt;
    }

    await GachaDB.ItemsStore.put(item);
    resetForm();
    renderList();
  }

  async function handleImageChange() {
    const file = els.imageInput.files[0];
    if (!file) return;
    selectedImageDataUrl = await fileToDataUrl(file);
    els.imagePreview.style.backgroundImage = `url('${selectedImageDataUrl}')`;
    els.imagePreview.classList.add('has-image');
    els.imagePreview.textContent = '';
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    const items = await GachaDB.ItemsStore.all();
    downloadJson('items.json', items);
  }

  async function ensureInitialData() {
    const count = await GachaDB.ItemsStore.count();
    if (count > 0) return;
    try {
      const items = await GachaCatalog.loadCatalog();
      if (Array.isArray(items) && items.length > 0) {
        await GachaDB.ItemsStore.bulkPut(items);
        return;
      }
    } catch (err) {
      // data/items.json not reachable (e.g. opened via file://) — fall back to demo data below.
    }
    await GachaSeed.seedIfEmpty();
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('形式が正しくありません(配列ではありません)。');
      const valid = data.filter((d) => d && d.id && d.name && d.rarity && d.image);
      if (valid.length === 0) throw new Error('有効なアイテムが見つかりませんでした。');
      if (!confirm(`${valid.length} 件のアイテムを読み込みます。同じIDの既存データは上書きされます。よろしいですか？`)) return;
      await GachaDB.ItemsStore.bulkPut(valid);
      renderList();
      alert(`${valid.length} 件のアイテムを読み込みました。`);
    } catch (err) {
      alert('読み込みに失敗しました: ' + err.message);
    } finally {
      e.target.value = '';
    }
  }

  function readThemeForm() {
    return {
      accent: els.themeAccent.value,
      accent2: els.themeAccent2.value,
      bg0: els.themeBg0.value,
      bg1: els.themeBg1.value,
      bg2: els.themeBg2.value,
      rarity: {
        N: els.themeRarityN.value,
        R: els.themeRarityR.value,
        SR: els.themeRaritySR.value,
        SSR: els.themeRaritySSR.value,
      },
      effects: {
        packShine: els.themeFxPackShine.checked,
        burstFlash: els.themeFxBurst.checked,
        ssrHolo: els.themeFxHolo.checked,
        reducedMotion: els.themeFxReducedMotion.checked,
      },
    };
  }

  function populateThemeForm(theme) {
    els.themeAccent.value = theme.accent;
    els.themeAccent2.value = theme.accent2;
    els.themeBg0.value = theme.bg0;
    els.themeBg1.value = theme.bg1;
    els.themeBg2.value = theme.bg2;
    els.themeRarityN.value = theme.rarity.N;
    els.themeRarityR.value = theme.rarity.R;
    els.themeRaritySR.value = theme.rarity.SR;
    els.themeRaritySSR.value = theme.rarity.SSR;
    els.themeFxPackShine.checked = theme.effects.packShine;
    els.themeFxBurst.checked = theme.effects.burstFlash;
    els.themeFxHolo.checked = theme.effects.ssrHolo;
    els.themeFxReducedMotion.checked = theme.effects.reducedMotion;
  }

  async function renderPreviewCard() {
    const key = els.themePreviewRarity.value;
    const rarity = GachaRarity.info(key);
    els.themePreviewCard.className = `seal-card enter revealed flipped fx-${rarity.glow}`;
    els.themePreviewCard.style.setProperty('--rc', rarity.color);
    els.themePreviewBadge.textContent = rarity.key;

    const items = await GachaDB.ItemsStore.all();
    const sample = items.find((it) => it.rarity === key) || items[0];
    els.themePreviewImage.style.backgroundImage = sample ? `url('${sample.image}')` : 'none';
  }

  function applyThemePreview() {
    GachaTheme.applyTheme(readThemeForm());
    renderPreviewCard();
  }

  function playPreviewEffects() {
    els.themePreviewBurst.classList.remove('play');
    void els.themePreviewBurst.offsetWidth; // restart animation
    els.themePreviewBurst.classList.add('play');
    els.themePreviewCard.classList.remove('revealed');
    void els.themePreviewCard.offsetWidth;
    els.themePreviewCard.classList.add('revealed');
  }

  async function initThemePanel() {
    els.themeAccent = document.getElementById('themeAccent');
    els.themeAccent2 = document.getElementById('themeAccent2');
    els.themeBg0 = document.getElementById('themeBg0');
    els.themeBg1 = document.getElementById('themeBg1');
    els.themeBg2 = document.getElementById('themeBg2');
    els.themeRarityN = document.getElementById('themeRarityN');
    els.themeRarityR = document.getElementById('themeRarityR');
    els.themeRaritySR = document.getElementById('themeRaritySR');
    els.themeRaritySSR = document.getElementById('themeRaritySSR');
    els.themeFxPackShine = document.getElementById('themeFxPackShine');
    els.themeFxBurst = document.getElementById('themeFxBurst');
    els.themeFxHolo = document.getElementById('themeFxHolo');
    els.themeFxReducedMotion = document.getElementById('themeFxReducedMotion');
    els.themePreviewRarity = document.getElementById('themePreviewRarity');
    els.themePreviewCard = document.getElementById('themePreviewCard');
    els.themePreviewImage = document.getElementById('themePreviewImage');
    els.themePreviewBadge = document.getElementById('themePreviewBadge');
    els.themePreviewBurst = document.getElementById('themePreviewBurst');
    els.themePreviewPlayBtn = document.getElementById('themePreviewPlayBtn');
    els.themeSaveBtn = document.getElementById('themeSaveBtn');
    els.themeResetBtn = document.getElementById('themeResetBtn');
    els.themeExportBtn = document.getElementById('themeExportBtn');

    els.themePreviewRarity.innerHTML = GachaRarity.RARITY_ORDER
      .map((key) => `<option value="${key}">${key} - ${GachaRarity.RARITY[key].name}</option>`)
      .join('');
    els.themePreviewRarity.value = 'SSR';

    const saved = await GachaDB.SettingsStore.get('theme');
    const initial = saved ? GachaTheme.mergeWithDefaults(saved) : await GachaTheme.loadPublishedTheme();
    populateThemeForm(initial);
    applyThemePreview();

    const panel = document.getElementById('themePreview').closest('.admin-panel');
    panel.addEventListener('input', (e) => {
      if (e.target.closest('.theme-color-grid, .theme-toggle-list')) applyThemePreview();
    });
    els.themePreviewRarity.addEventListener('change', renderPreviewCard);
    els.themePreviewPlayBtn.addEventListener('click', playPreviewEffects);

    els.themeSaveBtn.addEventListener('click', async () => {
      await GachaDB.SettingsStore.put('theme', readThemeForm());
      alert('見た目の設定を保存しました(このブラウザ内のみ反映)。公開サイトに反映するには書き出しが必要です。');
    });
    els.themeResetBtn.addEventListener('click', () => {
      if (!confirm('見た目の設定をデフォルトに戻します。よろしいですか？')) return;
      populateThemeForm(GachaTheme.DEFAULT_THEME);
      applyThemePreview();
    });
    els.themeExportBtn.addEventListener('click', () => {
      downloadJson('theme.json', readThemeForm());
    });
  }

  async function handleResetCollection() {
    if (!confirm('この端末の所持データ(コレクション進捗)をすべて削除します。よろしいですか？この操作は取り消せません。')) return;
    await GachaDB.CollectionStore.clear();
    alert('所持データをリセットしました。');
  }

  function bindEvents() {
    els.form.addEventListener('submit', handleSubmit);
    els.imageInput.addEventListener('change', handleImageChange);
    els.cancelEditBtn.addEventListener('click', resetForm);
    els.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
      if (btn.dataset.action === 'delete') deleteItem(btn.dataset.id);
    });
    els.exportBtn.addEventListener('click', handleExport);
    els.importInput.addEventListener('change', handleImport);
    els.resetCollectionBtn.addEventListener('click', handleResetCollection);
  }

  async function init() {
    els.form = document.getElementById('itemForm');
    els.itemId = document.getElementById('itemId');
    els.name = document.getElementById('fieldName');
    els.rarity = document.getElementById('fieldRarity');
    els.author = document.getElementById('fieldAuthor');
    els.flavor = document.getElementById('fieldFlavor');
    els.imageInput = document.getElementById('fieldImage');
    els.imagePreview = document.getElementById('imagePreview');
    els.formHeading = document.getElementById('formHeading');
    els.submitBtn = document.getElementById('submitBtn');
    els.cancelEditBtn = document.getElementById('cancelEditBtn');
    els.list = document.getElementById('itemList');
    els.itemCount = document.getElementById('itemCount');
    els.exportBtn = document.getElementById('exportBtn');
    els.importInput = document.getElementById('importInput');
    els.resetCollectionBtn = document.getElementById('resetCollectionBtn');

    populateRaritySelect();
    resetForm();
    bindEvents();
    await ensureInitialData();
    await renderList();
    await initThemePanel();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
