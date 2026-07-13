/*
 * Collection grid: shows every catalog item, locked (silhouette) if never
 * obtained, revealed with owned-count if obtained at least once.
 */
(function (global) {
  const els = {};
  let activeFilter = 'ALL';

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function render() {
    let catalog;
    try {
      catalog = await GachaCatalog.loadCatalog();
    } catch (err) {
      els.grid.innerHTML = `<p class="empty-state">カタログの読み込みに失敗しました: ${err.message}</p>`;
      return;
    }
    const ownedList = await GachaDB.CollectionStore.all();
    const owned = new Map(ownedList.map((o) => [o.itemId, o]));

    const sorted = catalog.slice().sort((a, b) => {
      const ra = GachaRarity.info(a.rarity).order;
      const rb = GachaRarity.info(b.rarity).order;
      if (rb !== ra) return rb - ra;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const visible = activeFilter === 'ALL' ? sorted : sorted.filter((i) => i.rarity === activeFilter);

    els.progress.textContent = `${owned.size} / ${catalog.length}`;

    if (catalog.length === 0) {
      els.grid.innerHTML = '<p class="empty-state">まだアイテムが登録されていません。</p>';
      return;
    }
    if (visible.length === 0) {
      els.grid.innerHTML = '<p class="empty-state">該当するアイテムがありません。</p>';
      return;
    }

    els.grid.innerHTML = '';
    visible.forEach((item) => {
      const record = owned.get(item.id);
      const rarity = GachaRarity.info(item.rarity);
      const cell = document.createElement('div');
      cell.className = `sticker-cell ${record ? 'owned' : 'locked'}`;
      cell.style.setProperty('--rc', rarity.color);
      cell.innerHTML = `
        <div class="cell-image" style="background-image:url('${item.image}')"></div>
        <span class="cell-badge">${rarity.key}</span>
        ${record ? `<span class="cell-count">×${record.count}</span>` : ''}
        <span class="cell-name">${record ? escapeHtml(item.name) : '？？？？？'}</span>
      `;
      cell.addEventListener('click', () => {
        global.GachaMain.openItemModal(item);
      });
      els.grid.appendChild(cell);
    });
  }

  function initCollection() {
    els.grid = document.getElementById('collectionGrid');
    els.progress = document.getElementById('collectionProgress');
    els.filters = document.getElementById('collectionFilters');

    els.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      els.filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  }

  global.GachaCollection = { initCollection, render };
})(window);
