import { APP_CONFIG } from './app-config.js';

let dbPromise = null;

/**
 * Opens the single shared IndexedDB database. All object stores across all
 * storage modules (transactions, priceSnapshots, scorecards) must be created
 * here, in one onupgradeneeded handler — IndexedDB requires that.
 */
export function openDB() {
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

      if (!db.objectStoreNames.contains(APP_CONFIG.PRICE_STORE_NAME)) {
        const store = db.createObjectStore(APP_CONFIG.PRICE_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_symbol', 'symbol');
        store.createIndex('by_asOfDate', 'asOfDate');
      }

      if (!db.objectStoreNames.contains(APP_CONFIG.SCORECARD_STORE_NAME)) {
        const store = db.createObjectStore(APP_CONFIG.SCORECARD_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_symbol', 'symbol');
        store.createIndex('by_date', 'date');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
