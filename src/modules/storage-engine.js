import { APP_CONFIG } from './app-config.js';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APP_CONFIG.STORE_NAME)) {
        const store = db.createObjectStore(APP_CONFIG.STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_date', 'date');
        store.createIndex('by_symbol', 'symbol');
        store.createIndex('by_type', 'type');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Promise-based IndexedDB wrapper. The `transactions` store is the only Ledger — Holdings/Realized P&L are computed, never stored (see CONTEXT.md). */
export const STORAGE_ENGINE = {
  async getAll() {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.STORE_NAME, 'readonly').objectStore(APP_CONFIG.STORE_NAME);
    return promisifyRequest(store.getAll());
  },

  async add(transaction) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.STORE_NAME, 'readwrite').objectStore(APP_CONFIG.STORE_NAME);
    const now = Date.now();
    const record = { ...transaction, createdAt: now, updatedAt: now };
    const id = await promisifyRequest(store.add(record));
    return { ...record, id };
  },

  async update(id, changes) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.STORE_NAME, 'readwrite').objectStore(APP_CONFIG.STORE_NAME);
    const existing = await promisifyRequest(store.get(id));
    if (!existing) throw new Error(`Transaction ${id} not found`);
    const updated = { ...existing, ...changes, id, updatedAt: Date.now() };
    await promisifyRequest(store.put(updated));
    return updated;
  },

  async remove(id) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.STORE_NAME, 'readwrite').objectStore(APP_CONFIG.STORE_NAME);
    await promisifyRequest(store.delete(id));
  },

  /** Wipes the Ledger and replaces it with `transactions` (used by JSON import). One atomic transaction — either all of it lands, or none of it does. */
  async replaceAll(transactions) {
    const db = await openDB();
    const tx = db.transaction(APP_CONFIG.STORE_NAME, 'readwrite');
    const store = tx.objectStore(APP_CONFIG.STORE_NAME);
    store.clear();
    for (const t of transactions) store.put(t);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};
