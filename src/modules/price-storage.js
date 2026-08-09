import { APP_CONFIG } from './app-config.js';
import { openDB, promisifyRequest } from './db.js';

/** Promise-based IndexedDB wrapper for Price Snapshots — full history kept, never overwritten in place except by explicit edit. */
export const PRICE_STORAGE = {
  async getAll() {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.PRICE_STORE_NAME, 'readonly').objectStore(APP_CONFIG.PRICE_STORE_NAME);
    return promisifyRequest(store.getAll());
  },

  async add(snapshot) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.PRICE_STORE_NAME, 'readwrite').objectStore(APP_CONFIG.PRICE_STORE_NAME);
    const now = Date.now();
    const record = { ...snapshot, createdAt: now, updatedAt: now };
    const id = await promisifyRequest(store.add(record));
    return { ...record, id };
  },

  async update(id, changes) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.PRICE_STORE_NAME, 'readwrite').objectStore(APP_CONFIG.PRICE_STORE_NAME);
    const existing = await promisifyRequest(store.get(id));
    if (!existing) throw new Error(`Price Snapshot ${id} not found`);
    const updated = { ...existing, ...changes, id, updatedAt: Date.now() };
    await promisifyRequest(store.put(updated));
    return updated;
  },

  async remove(id) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.PRICE_STORE_NAME, 'readwrite').objectStore(APP_CONFIG.PRICE_STORE_NAME);
    await promisifyRequest(store.delete(id));
  }
};
