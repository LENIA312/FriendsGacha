/*
 * App bootstrap: view switching (tabs) + shared item detail modal.
 */
(function (global) {
  const els = {};

  function switchView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === viewId));
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === viewId));
    if (viewId === 'collection-view') {
      GachaCollection.render();
    }
  }

  async function openItemModal(item) {
    const record = await GachaDB.CollectionStore.get(item.id);
    const rarity = GachaRarity.info(item.rarity);
    els.modalCard.style.setProperty('--rc', rarity.color);
    els.modalRarityBadge.textContent = rarity.key;
    els.modalRarityBadge.title = rarity.name;

    if (record) {
      els.modalImage.style.backgroundImage = `url('${item.image}')`;
      els.modalImage.classList.remove('locked-image');
      els.modalName.textContent = item.name;
      els.modalAuthor.textContent = `作者: ${item.author || '不明'}`;
      els.modalFlavor.textContent = item.flavorText || '';
      els.modalOwnedCount.textContent = `所持数: ×${record.count}（初取得: ${new Date(record.firstObtainedAt).toLocaleDateString('ja-JP')}）`;
    } else {
      els.modalImage.style.backgroundImage = 'none';
      els.modalImage.style.background = 'linear-gradient(160deg, #3a2a63, #1b1030)';
      els.modalName.textContent = '？？？？？';
      els.modalAuthor.textContent = '';
      els.modalFlavor.textContent = 'まだ入手していません。ガチャを引いて見つけよう。';
      els.modalOwnedCount.textContent = '';
    }
    els.modal.classList.remove('hidden');
  }

  function closeItemModal() {
    els.modal.classList.add('hidden');
  }

  function openHowToPlay() {
    els.howToModal.classList.remove('hidden');
  }

  function closeHowToPlay() {
    els.howToModal.classList.add('hidden');
  }

  async function initHowToPlay(hadSeenBefore) {
    els.howToModal = document.getElementById('howToPlayModal');
    document.getElementById('helpBtn').addEventListener('click', openHowToPlay);
    document.getElementById('howToPlayClose').addEventListener('click', closeHowToPlay);
    els.howToModal.addEventListener('click', (e) => {
      if (e.target === els.howToModal) closeHowToPlay();
    });

    if (!hadSeenBefore) {
      openHowToPlay();
      await GachaDB.SettingsStore.put('howToPlaySeen', true);
    }
  }

  function initNewItemsModal() {
    els.newItemsModal = document.getElementById('newItemsModal');
    document.getElementById('newItemsClose').addEventListener('click', () => {
      els.newItemsModal.classList.add('hidden');
    });
    els.newItemsModal.addEventListener('click', (e) => {
      if (e.target === els.newItemsModal) els.newItemsModal.classList.add('hidden');
    });
  }

  // Notifies returning players when the published catalog (data/items.json) has grown since
  // their last visit. First-time visitors are shown the how-to-play tutorial instead, and the
  // very first time this check ever runs on a browser there's no prior baseline to diff against
  // (so it just records one silently rather than claiming the whole catalog is "new").
  async function checkNewItems(hadSeenTutorial) {
    let catalog;
    try {
      catalog = await GachaCatalog.loadCatalog();
    } catch (err) {
      return;
    }
    const currentIds = catalog.map((item) => item.id);
    const knownIds = await GachaDB.SettingsStore.get('knownItemIds');
    if (!Array.isArray(knownIds)) {
      await GachaDB.SettingsStore.put('knownItemIds', currentIds);
      return;
    }
    const hasNewItem = currentIds.some((id) => !knownIds.includes(id));
    if (hasNewItem) {
      await GachaDB.SettingsStore.put('knownItemIds', currentIds);
      if (hadSeenTutorial) {
        els.newItemsModal.classList.remove('hidden');
      }
    }
  }

  function initReleaseNoteModal() {
    els.releaseNoteModal = document.getElementById('releaseNoteModal');
    document.getElementById('releaseNoteClose').addEventListener('click', () => {
      els.releaseNoteModal.classList.add('hidden');
    });
    els.releaseNoteModal.addEventListener('click', (e) => {
      if (e.target === els.releaseNoteModal) els.releaseNoteModal.classList.add('hidden');
    });
  }

  // Shows data/releasenote.json's content once per "version" to returning players (first-time
  // visitors get the how-to-play tutorial instead, and just have this version recorded silently).
  // To make the note reappear for everyone, bump "version" in data/releasenote.json before
  // publishing a new one — see docs/SPEC.md for the exact steps.
  async function checkReleaseNote(hadSeenTutorial) {
    let note;
    try {
      const res = await fetch('data/releasenote.json', { cache: 'no-cache' });
      note = res.ok ? await res.json() : null;
    } catch (err) {
      note = null;
    }
    if (!note || typeof note.version === 'undefined') return;

    const seenVersion = await GachaDB.SettingsStore.get('checkRereleaseNote');
    if (seenVersion === note.version) return;
    await GachaDB.SettingsStore.put('checkRereleaseNote', note.version);
    if (!hadSeenTutorial) return;

    document.getElementById('releaseNoteTitle').textContent = note.title || '更新のお知らせ';
    document.getElementById('releaseNoteText').textContent = note.txt || '';
    els.releaseNoteModal.classList.remove('hidden');
  }

  let collectionRefreshTimer = null;
  function refreshCollectionSoon() {
    clearTimeout(collectionRefreshTimer);
    collectionRefreshTimer = setTimeout(() => GachaCollection.render(), 100);
  }

  async function bootstrap() {
    await GachaTheme.initPublished();

    els.modal = document.getElementById('itemModal');
    els.modalCard = document.getElementById('modalCard');
    els.modalImage = document.getElementById('modalImage');
    els.modalRarityBadge = document.getElementById('modalRarityBadge');
    els.modalName = document.getElementById('modalName');
    els.modalAuthor = document.getElementById('modalAuthor');
    els.modalFlavor = document.getElementById('modalFlavor');
    els.modalOwnedCount = document.getElementById('modalOwnedCount');
    document.getElementById('modalClose').addEventListener('click', closeItemModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeItemModal();
    });

    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });

    const hadSeenTutorial = !!(await GachaDB.SettingsStore.get('howToPlaySeen'));
    await initHowToPlay(hadSeenTutorial);
    initNewItemsModal();
    initReleaseNoteModal();

    try {
      await GachaMame.init();
    } catch (err) {
      console.error('マメ工房の初期化に失敗しました:', err);
    }
    GachaPlay.initGacha();
    GachaCollection.initCollection();
    await GachaCollection.render();
    await checkNewItems(hadSeenTutorial);
    await checkReleaseNote(hadSeenTutorial);
  }

  global.GachaMain = { openItemModal, refreshCollectionSoon };
  document.addEventListener('DOMContentLoaded', bootstrap);
})(window);
