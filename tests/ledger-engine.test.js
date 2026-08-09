import { describe, expect, it } from 'vitest';
import { LEDGER_ENGINE, LedgerError, TRANSACTION_TYPES } from '../src/modules/ledger-engine.js';

let nextId = 1;
function tx(overrides) {
  return {
    id: nextId++,
    date: '2026-01-01',
    createdAt: nextId,
    ...overrides
  };
}

describe('LEDGER_ENGINE.replay — Holding via Average Cost', () => {
  it('1. weighted average cost after multiple Buys at different prices', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1000 }),
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1400 })
    ];
    const { holdings } = LEDGER_ENGINE.replay(transactions);
    expect(holdings).toEqual([{ symbol: 'PTT', quantity: 200, averageCost: 12 }]);
  });

  it('2. partial Sell leaves average cost unchanged, only quantity drops', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 200, netCashOut: 2400 }),
      tx({ type: TRANSACTION_TYPES.SELL, symbol: 'PTT', quantity: 50, netCashIn: 700 })
    ];
    const { holdings } = LEDGER_ENGINE.replay(transactions);
    expect(holdings).toEqual([{ symbol: 'PTT', quantity: 150, averageCost: 12 }]);
  });

  it('3. Realized P&L = proceeds minus cost basis of quantity sold, both gain and loss', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 200, netCashOut: 2400 }), // avg 12
      tx({ type: TRANSACTION_TYPES.SELL, symbol: 'PTT', quantity: 50, netCashIn: 700 }), // gain: 700 - 600 = 100
      tx({ type: TRANSACTION_TYPES.SELL, symbol: 'PTT', quantity: 50, netCashIn: 500 }) // loss: 500 - 600 = -100
    ];
    const { realizedPnL, totalRealizedPnL } = LEDGER_ENGINE.replay(transactions);
    expect(realizedPnL).toHaveLength(2);
    expect(realizedPnL[0]).toMatchObject({ proceeds: 700, costBasis: 600, realizedPnL: 100 });
    expect(realizedPnL[1]).toMatchObject({ proceeds: 500, costBasis: 600, realizedPnL: -100 });
    expect(totalRealizedPnL).toBe(0);
  });

  it('4. Sell down to zero then Buy again recomputes average cost from scratch', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1000 }), // avg 10
      tx({ type: TRANSACTION_TYPES.SELL, symbol: 'PTT', quantity: 100, netCashIn: 1500 }), // qty -> 0
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 50, netCashOut: 1000 }) // avg 20, must not blend with old 10
    ];
    const { holdings } = LEDGER_ENGINE.replay(transactions);
    expect(holdings).toEqual([{ symbol: 'PTT', quantity: 50, averageCost: 20 }]);
  });

  it('5. Manual Adjustment sets a new baseline that later Buys build on', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1000 }), // avg 10
      tx({
        type: TRANSACTION_TYPES.MANUAL_ADJUSTMENT,
        symbol: 'PTT',
        newQuantity: 150,
        newAverageCost: 8
      }), // simulates a corporate action
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 50, netCashOut: 500 }) // avg (1200+500)/200 = 8.5
    ];
    const { holdings } = LEDGER_ENGINE.replay(transactions);
    expect(holdings).toEqual([{ symbol: 'PTT', quantity: 200, averageCost: 8.5 }]);
  });

  it('6. Cash Dividend leaves the Holding untouched', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1000 }),
      tx({ type: TRANSACTION_TYPES.CASH_DIVIDEND, symbol: 'PTT', netCashIn: 50 })
    ];
    const { holdings, cashSummary } = LEDGER_ENGINE.replay(transactions);
    expect(holdings).toEqual([{ symbol: 'PTT', quantity: 100, averageCost: 10 }]);
    expect(cashSummary.totalCashDividends).toBe(50);
  });

  it('6b. Cash Dividend without a symbol is rejected', () => {
    const transactions = [tx({ type: TRANSACTION_TYPES.CASH_DIVIDEND, netCashIn: 50 })];
    expect(() => LEDGER_ENGINE.replay(transactions)).toThrow(LedgerError);
  });

  it('7. Cash Deposit/Withdrawal never touches Holdings, only the cash summary', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.CASH_DEPOSIT_WITHDRAWAL, direction: 'DEPOSIT', amount: 100000 }),
      tx({ type: TRANSACTION_TYPES.CASH_DEPOSIT_WITHDRAWAL, direction: 'WITHDRAWAL', amount: 20000 })
    ];
    const { holdings, cashSummary } = LEDGER_ENGINE.replay(transactions);
    expect(holdings).toEqual([]);
    expect(cashSummary).toMatchObject({
      totalDeposits: 100000,
      totalWithdrawals: 20000,
      netPrincipal: 80000
    });
  });

  it('8. Oversell is rejected outright', () => {
    const transactions = [
      tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1000 }),
      tx({ type: TRANSACTION_TYPES.SELL, symbol: 'PTT', quantity: 150, netCashIn: 2000 })
    ];
    expect(() => LEDGER_ENGINE.replay(transactions)).toThrow(LedgerError);
  });

  it('9. Same-day transactions apply in createdAt order, not array order', () => {
    const sell = tx({
      type: TRANSACTION_TYPES.SELL,
      symbol: 'PTT',
      quantity: 50,
      netCashIn: 700,
      date: '2026-01-01',
      createdAt: 2
    });
    const buy = tx({
      type: TRANSACTION_TYPES.BUY,
      symbol: 'PTT',
      quantity: 100,
      netCashOut: 1000,
      date: '2026-01-01',
      createdAt: 1
    });
    // Sell appears first in the array, but its createdAt is later than the Buy's —
    // the engine must sort by (date, createdAt) and apply the Buy first.
    const { holdings } = LEDGER_ENGINE.replay([sell, buy]);
    expect(holdings).toEqual([{ symbol: 'PTT', quantity: 50, averageCost: 10 }]);
  });

  it('10. Editing/deleting a past Transaction changes the replayed result (no stale state)', () => {
    const buy1 = tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 100, netCashOut: 1000 });
    const buy2 = tx({ type: TRANSACTION_TYPES.BUY, symbol: 'PTT', quantity: 50, netCashOut: 600 });

    const before = LEDGER_ENGINE.replay([buy1, buy2]);
    expect(before.holdings).toEqual([{ symbol: 'PTT', quantity: 150, averageCost: (1000 + 600) / 150 }]);

    const buy1Edited = { ...buy1, quantity: 200, netCashOut: 2000 };
    const afterEdit = LEDGER_ENGINE.replay([buy1Edited, buy2]);
    expect(afterEdit.holdings).toEqual([{ symbol: 'PTT', quantity: 250, averageCost: (2000 + 600) / 250 }]);

    const afterDelete = LEDGER_ENGINE.replay([buy1Edited]);
    expect(afterDelete.holdings).toEqual([{ symbol: 'PTT', quantity: 200, averageCost: 10 }]);
  });
});

describe('LEDGER_ENGINE.canSell', () => {
  it('allows selling up to the held quantity, rejects more', () => {
    const holdings = [{ symbol: 'PTT', quantity: 100, averageCost: 10 }];
    expect(LEDGER_ENGINE.canSell(holdings, 'PTT', 100)).toBe(true);
    expect(LEDGER_ENGINE.canSell(holdings, 'PTT', 101)).toBe(false);
    expect(LEDGER_ENGINE.canSell(holdings, 'CPALL', 1)).toBe(false);
  });
});
