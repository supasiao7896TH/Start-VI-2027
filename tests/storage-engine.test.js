import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSACTION_TYPES } from '../src/modules/ledger-engine.js';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  vi.resetModules();
});

async function loadEngine() {
  const mod = await import('../src/modules/storage-engine.js');
  return mod.STORAGE_ENGINE;
}

describe('STORAGE_ENGINE', () => {
  it('add() assigns an id and timestamps, getAll() returns it back', async () => {
    const STORAGE_ENGINE = await loadEngine();
    const saved = await STORAGE_ENGINE.add({
      type: TRANSACTION_TYPES.BUY,
      date: '2026-01-01',
      symbol: 'PTT',
      quantity: 100,
      netCashOut: 1000
    });
    expect(saved.id).toBeDefined();
    expect(saved.createdAt).toBeDefined();

    const all = await STORAGE_ENGINE.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ symbol: 'PTT', quantity: 100 });
  });

  it('update() merges changes and bumps updatedAt without changing id', async () => {
    const STORAGE_ENGINE = await loadEngine();
    const saved = await STORAGE_ENGINE.add({
      type: TRANSACTION_TYPES.BUY,
      date: '2026-01-01',
      symbol: 'PTT',
      quantity: 100,
      netCashOut: 1000
    });
    const updated = await STORAGE_ENGINE.update(saved.id, { quantity: 200 });
    expect(updated.id).toBe(saved.id);
    expect(updated.quantity).toBe(200);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(saved.createdAt);
  });

  it('remove() deletes the record', async () => {
    const STORAGE_ENGINE = await loadEngine();
    const saved = await STORAGE_ENGINE.add({
      type: TRANSACTION_TYPES.CASH_DEPOSIT_WITHDRAWAL,
      date: '2026-01-01',
      direction: 'DEPOSIT',
      amount: 50000
    });
    await STORAGE_ENGINE.remove(saved.id);
    const all = await STORAGE_ENGINE.getAll();
    expect(all).toHaveLength(0);
  });
});
