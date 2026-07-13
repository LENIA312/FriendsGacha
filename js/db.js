/*
 * IndexedDB wrapper for the gacha app.
 * Two object stores:
 *   - "items"      : the catalog of all illustrations that can appear in the gacha
 *   - "collection" : which items the player has obtained (and how many times)
 */
(function (global) {
  const DB_NAME = 'seal-gacha-db';
  const DB_VERSION = 1;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('items')) {
          const items = db.createObjectStore('items', { keyPath: 'id' });
          items.createIndex('rarity', 'rarity', { unique: false });
        }
        if (!db.objectStoreNames.contains('collection')) {
          db.createObjectStore('collection', { keyPath: 'itemId' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const ItemsStore = {
    async all() {
      const store = await tx('items', 'readonly');
      return reqToPromise(store.getAll());
    },
    async get(id) {
      const store = await tx('items', 'readonly');
      return reqToPromise(store.get(id));
    },
    async put(item) {
      const store = await tx('items', 'readwrite');
      return reqToPromise(store.put(item));
    },
    async remove(id) {
      const store = await tx('items', 'readwrite');
      return reqToPromise(store.delete(id));
    },
    async count() {
      const store = await tx('items', 'readonly');
      return reqToPromise(store.count());
    },
    async bulkPut(items) {
      const store = await tx('items', 'readwrite');
      items.forEach((it) => store.put(it));
      return new Promise((resolve, reject) => {
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => reject(store.transaction.error);
      });
    },
  };

  const CollectionStore = {
    async all() {
      const store = await tx('collection', 'readonly');
      return reqToPromise(store.getAll());
    },
    async get(itemId) {
      const store = await tx('collection', 'readonly');
      return reqToPromise(store.get(itemId));
    },
    async recordObtain(itemId) {
      const store = await tx('collection', 'readwrite');
      const existing = await reqToPromise(store.get(itemId));
      const isNew = !existing;
      const record = existing
        ? { ...existing, count: existing.count + 1 }
        : { itemId, count: 1, firstObtainedAt: Date.now() };
      store.put(record);
      await new Promise((resolve, reject) => {
        store.transaction.oncomplete = resolve;
        store.transaction.onerror = () => reject(store.transaction.error);
      });
      return isNew;
    },
    async clear() {
      const store = await tx('collection', 'readwrite');
      return reqToPromise(store.clear());
    },
  };

  global.GachaDB = { ItemsStore, CollectionStore, openDb };
})(window);
