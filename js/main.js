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

    GachaPlay.initGacha();
    GachaCollection.initCollection();
    await GachaCollection.render();
  }

  global.GachaMain = { openItemModal, refreshCollectionSoon };
  document.addEventListener('DOMContentLoaded', bootstrap);
})(window);
