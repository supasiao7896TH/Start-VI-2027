import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  vi.resetModules();
});

async function loadEngine() {
  const mod = await import('../src/modules/price-storage.js');
  return mod.PRICE_STORAGE;
}

describe('PRICE_STORAGE', () => {
  it('add() assigns an id and timestamps, getAll() returns it back', async () => {
    const PRICE_STORAGE = await loadEngine();
    const saved = await PRICE_STORAGE.add({ symbol: 'PTT', price: 35, asOfDate: '2026-01-01' });
    expect(saved.id).toBeDefined();
    expect(saved.createdAt).toBeDefined();

    const all = await PRICE_STORAGE.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ symbol: 'PTT', price: 35 });
  });

  it('keeps multiple snapshots per symbol (full history, not latest-only)', async () => {
    const PRICE_STORAGE = await loadEngine();
    await PRICE_STORAGE.add({ symbol: 'PTT', price: 35, asOfDate: '2026-01-01' });
    await PRICE_STORAGE.add({ symbol: 'PTT', price: 38, asOfDate: '2026-02-01' });

    const all = await PRICE_STORAGE.getAll();
    expect(all).toHaveLength(2);
  });

  it('update() merges changes without changing id', async () => {
    const PRICE_STORAGE = await loadEngine();
    const saved = await PRICE_STORAGE.add({ symbol: 'PTT', price: 35, asOfDate: '2026-01-01' });
    const updated = await PRICE_STORAGE.update(saved.id, { price: 36 });
    expect(updated.id).toBe(saved.id);
    expect(updated.price).toBe(36);
  });

  it('remove() deletes the record', async () => {
    const PRICE_STORAGE = await loadEngine();
    const saved = await PRICE_STORAGE.add({ symbol: 'PTT', price: 35, asOfDate: '2026-01-01' });
    await PRICE_STORAGE.remove(saved.id);
    expect(await PRICE_STORAGE.getAll()).toHaveLength(0);
  });
});
