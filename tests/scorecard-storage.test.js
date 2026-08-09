import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  vi.resetModules();
});

async function loadEngine() {
  const mod = await import('../src/modules/scorecard-storage.js');
  return mod.SCORECARD_STORAGE;
}

describe('SCORECARD_STORAGE', () => {
  it('add() assigns an id and timestamps, getAll() returns it back', async () => {
    const SCORECARD_STORAGE = await loadEngine();
    const saved = await SCORECARD_STORAGE.add({
      symbol: 'PTT',
      date: '2026-01-01',
      criteria: { roeAbove10: true },
      valuationInputs: { eps: 4 }
    });
    expect(saved.id).toBeDefined();
    expect(saved.createdAt).toBeDefined();

    const all = await SCORECARD_STORAGE.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ symbol: 'PTT' });
  });

  it('update() merges changes without changing id', async () => {
    const SCORECARD_STORAGE = await loadEngine();
    const saved = await SCORECARD_STORAGE.add({ symbol: 'PTT', date: '2026-01-01', criteria: {}, valuationInputs: {} });
    const updated = await SCORECARD_STORAGE.update(saved.id, { criteria: { roeAbove10: true } });
    expect(updated.id).toBe(saved.id);
    expect(updated.criteria).toEqual({ roeAbove10: true });
  });

  it('remove() deletes the record', async () => {
    const SCORECARD_STORAGE = await loadEngine();
    const saved = await SCORECARD_STORAGE.add({ symbol: 'PTT', date: '2026-01-01', criteria: {}, valuationInputs: {} });
    await SCORECARD_STORAGE.remove(saved.id);
    expect(await SCORECARD_STORAGE.getAll()).toHaveLength(0);
  });
});
