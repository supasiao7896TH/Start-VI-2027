import { APP_CONFIG } from './app-config.js';
import { openDB, promisifyRequest } from './db.js';

/** Promise-based IndexedDB wrapper for VI Scorecard entries — stores only raw inputs (criteria checkboxes + valuation inputs); score/verdict/valuation are always computed fresh, never stored. */
export const SCORECARD_STORAGE = {
  async getAll() {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.SCORECARD_STORE_NAME, 'readonly').objectStore(APP_CONFIG.SCORECARD_STORE_NAME);
    return promisifyRequest(store.getAll());
  },

  async add(entry) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.SCORECARD_STORE_NAME, 'readwrite').objectStore(APP_CONFIG.SCORECARD_STORE_NAME);
    const now = Date.now();
    const record = { ...entry, createdAt: now, updatedAt: now };
    const id = await promisifyRequest(store.add(record));
    return { ...record, id };
  },

  async update(id, changes) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.SCORECARD_STORE_NAME, 'readwrite').objectStore(APP_CONFIG.SCORECARD_STORE_NAME);
    const existing = await promisifyRequest(store.get(id));
    if (!existing) throw new Error(`Scorecard entry ${id} not found`);
    const updated = { ...existing, ...changes, id, updatedAt: Date.now() };
    await promisifyRequest(store.put(updated));
    return updated;
  },

  async remove(id) {
    const db = await openDB();
    const store = db.transaction(APP_CONFIG.SCORECARD_STORE_NAME, 'readwrite').objectStore(APP_CONFIG.SCORECARD_STORE_NAME);
    await promisifyRequest(store.delete(id));
  }
};
