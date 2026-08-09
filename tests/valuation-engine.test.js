import { describe, expect, it } from 'vitest';
import {
  calculateAllValuations,
  calculateDCF,
  calculateDDM,
  calculateFcfPerShareFromFinancials,
  calculateGrahamNumber,
  calculatePERelative,
  calculateUnrealizedPnL,
  getLatestPrice,
  getSuggestedDividendPerShare,
  summarizeValuation,
  ValuationError
} from '../src/modules/valuation-engine.js';

let nextId = 1;
function tx(overrides) {
  return { id: nextId++, date: '2026-01-01', createdAt: nextId, ...overrides };
}

describe('getLatestPrice', () => {
  it('picks the snapshot with the latest asOfDate for the symbol', () => {
    const snapshots = [
      { symbol: 'PTT', price: 35, asOfDate: '2026-01-01', createdAt: 1 },
      { symbol: 'PTT', price: 38, asOfDate: '2026-03-01', createdAt: 2 },
      { symbol: 'PTT', price: 36, asOfDate: '2026-02-01', createdAt: 3 },
      { symbol: 'PTTGC', price: 40, asOfDate: '2026-03-01', createdAt: 4 }
    ];
    expect(getLatestPrice(snapshots, 'PTT')).toBe(38);
  });

  it('breaks ties on the same date by createdAt', () => {
    const snapshots = [
      { symbol: 'PTT', price: 35, asOfDate: '2026-01-01', createdAt: 1 },
      { symbol: 'PTT', price: 36, asOfDate: '2026-01-01', createdAt: 2 }
    ];
    expect(getLatestPrice(snapshots, 'PTT')).toBe(36);
  });

  it('returns null when the symbol has no snapshots', () => {
    expect(getLatestPrice([], 'PTT')).toBeNull();
  });
});

describe('getSuggestedDividendPerShare', () => {
  it('divides the latest Cash Dividend by the quantity held at that time', () => {
    const transactions = [
      tx({ type: 'BUY', symbol: 'PTT', quantity: 100, netCashOut: 3500, date: '2026-01-01' }),
      tx({ type: 'CASH_DIVIDEND', symbol: 'PTT', netCashIn: 200, date: '2026-02-01' })
    ];
    expect(getSuggestedDividendPerShare(transactions, 'PTT')).toBe(2); // 200 / 100
  });

  it('picks the most recent dividend when there are several, ignoring quantity changes after it', () => {
    const transactions = [
      tx({ type: 'BUY', symbol: 'PTT', quantity: 100, netCashOut: 3500, date: '2026-01-01' }),
      tx({ type: 'CASH_DIVIDEND', symbol: 'PTT', netCashIn: 200, date: '2026-02-01' }), // 200/100 = 2
      tx({ type: 'BUY', symbol: 'PTT', quantity: 100, netCashOut: 4000, date: '2026-03-01' }), // now 200 held
      tx({ type: 'CASH_DIVIDEND', symbol: 'PTT', netCashIn: 500, date: '2026-04-01' }) // 500/200 = 2.5
    ];
    expect(getSuggestedDividendPerShare(transactions, 'PTT')).toBe(2.5);
  });

  it('returns null when the symbol has never paid a dividend in this Ledger', () => {
    const transactions = [tx({ type: 'BUY', symbol: 'PTT', quantity: 100, netCashOut: 3500, date: '2026-01-01' })];
    expect(getSuggestedDividendPerShare(transactions, 'PTT')).toBeNull();
  });
});

describe('calculateUnrealizedPnL', () => {
  it('computes currentValue and unrealizedPnL when a price exists', () => {
    const holdings = [{ symbol: 'PTT', quantity: 100, averageCost: 30 }];
    const snapshots = [{ symbol: 'PTT', price: 35, asOfDate: '2026-01-01', createdAt: 1 }];
    const [result] = calculateUnrealizedPnL(holdings, snapshots);
    expect(result.currentPrice).toBe(35);
    expect(result.currentValue).toBe(3500);
    expect(result.unrealizedPnL).toBe(500);
  });

  it('leaves currentPrice/currentValue/unrealizedPnL null when there is no snapshot', () => {
    const holdings = [{ symbol: 'PTT', quantity: 100, averageCost: 30 }];
    const [result] = calculateUnrealizedPnL(holdings, []);
    expect(result.currentPrice).toBeNull();
    expect(result.currentValue).toBeNull();
    expect(result.unrealizedPnL).toBeNull();
  });
});

describe('calculateFcfPerShareFromFinancials', () => {
  it('computes FCF/share as (OCF - CapEx) * price / marketCap', () => {
    // Shares outstanding = 5000 (marketCap) / 30 (price) = 166.67 (in the same
    // millions unit as OCF/CapEx) -> FCF/share = (500-100)/166.67 = 2.4
    const result = calculateFcfPerShareFromFinancials({
      operatingCashFlow: 500,
      capex: 100,
      marketCap: 5000,
      currentPrice: 30
    });
    expect(result).toBeCloseTo(((500 - 100) * 30) / 5000, 6);
  });

  it('treats a missing CapEx as 0', () => {
    const withoutCapex = calculateFcfPerShareFromFinancials({ operatingCashFlow: 500, marketCap: 5000, currentPrice: 30 });
    const withZeroCapex = calculateFcfPerShareFromFinancials({ operatingCashFlow: 500, capex: 0, marketCap: 5000, currentPrice: 30 });
    expect(withoutCapex).toBe(withZeroCapex);
  });

  it('returns null when a required input is missing', () => {
    expect(calculateFcfPerShareFromFinancials({ capex: 100, marketCap: 5000, currentPrice: 30 })).toBeNull(); // no OCF
    expect(calculateFcfPerShareFromFinancials({ operatingCashFlow: 500, capex: 100, currentPrice: 30 })).toBeNull(); // no marketCap
    expect(calculateFcfPerShareFromFinancials({ operatingCashFlow: 500, capex: 100, marketCap: 5000 })).toBeNull(); // no currentPrice
  });

  it('returns null instead of dividing by zero when marketCap is 0', () => {
    expect(calculateFcfPerShareFromFinancials({ operatingCashFlow: 500, marketCap: 0, currentPrice: 30 })).toBeNull();
  });
});

describe('calculateDCF', () => {
  it('matches a hand-computed two-stage DCF', () => {
    const inputs = { fcfPerShare: 10, wacc: 0.1, growthRate5y: 0.05, terminalGrowthRate: 0.03 };
    let pvSum = 0;
    let fcf = 10;
    for (let t = 1; t <= 5; t++) {
      fcf *= 1.05;
      pvSum += fcf / 1.1 ** t;
    }
    const terminalValue = (fcf * 1.03) / (0.1 - 0.03);
    const expected = pvSum + terminalValue / 1.1 ** 5;
    expect(calculateDCF(inputs)).toBeCloseTo(expected, 6);
  });

  it('rejects wacc <= terminalGrowthRate', () => {
    expect(() =>
      calculateDCF({ fcfPerShare: 10, wacc: 0.03, growthRate5y: 0.05, terminalGrowthRate: 0.03 })
    ).toThrow(ValuationError);
  });
});

describe('calculatePERelative', () => {
  it('is EPS times peer average P/E', () => {
    expect(calculatePERelative({ eps: 4, peerAveragePE: 12 })).toBe(48);
  });
});

describe('calculateGrahamNumber', () => {
  it('is sqrt(22.5 * EPS * BVPS)', () => {
    expect(calculateGrahamNumber({ eps: 4, bvps: 30 })).toBeCloseTo(Math.sqrt(22.5 * 4 * 30), 6);
  });

  it('rejects non-positive EPS or BVPS', () => {
    expect(() => calculateGrahamNumber({ eps: 0, bvps: 30 })).toThrow(ValuationError);
    expect(() => calculateGrahamNumber({ eps: 4, bvps: -1 })).toThrow(ValuationError);
  });
});

describe('calculateDDM', () => {
  it('is dpsNextYear / (requiredReturn - dividendGrowthRate)', () => {
    expect(calculateDDM({ dpsNextYear: 2, requiredReturn: 0.09, dividendGrowthRate: 0.03 })).toBeCloseTo(2 / 0.06, 6);
  });

  it('rejects requiredReturn <= dividendGrowthRate', () => {
    expect(() => calculateDDM({ dpsNextYear: 2, requiredReturn: 0.03, dividendGrowthRate: 0.03 })).toThrow(
      ValuationError
    );
  });
});

describe('calculateAllValuations', () => {
  const fullInputs = {
    fcfPerShare: 10,
    wacc: 0.1,
    growthRate5y: 0.05,
    terminalGrowthRate: 0.03,
    eps: 4,
    peerAveragePE: 12,
    bvps: 30,
    dpsNextYear: 2,
    requiredReturn: 0.09,
    dividendGrowthRate: 0.03,
    marginOfSafety: 0.25
  };

  it('computes all 4 methods and a summary when every input is present and valid', () => {
    const result = calculateAllValuations(fullInputs);
    expect(result.dcf).not.toBeNull();
    expect(result.peRelative).toBe(48);
    expect(result.grahamNumber).not.toBeNull();
    expect(result.ddm).not.toBeNull();
    expect(result.summary).not.toBeNull();
    expect(result.errors).toEqual([]);
  });

  it('missing inputs produce null for that method (not a throw, and no noisy error) and no summary', () => {
    const result = calculateAllValuations({ eps: 4, peerAveragePE: 12 });
    expect(result.peRelative).toBe(48);
    expect(result.dcf).toBeNull();
    expect(result.grahamNumber).toBeNull();
    expect(result.ddm).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it('a completely empty form produces all nulls and no error messages', () => {
    const result = calculateAllValuations({});
    expect(result).toMatchObject({ dcf: null, peRelative: null, grahamNumber: null, ddm: null, summary: null, errors: [] });
  });

  it('a guard failure (e.g. wacc <= terminalGrowthRate) is null with a message in errors, other methods unaffected', () => {
    const result = calculateAllValuations({ ...fullInputs, wacc: 0.02 });
    expect(result.dcf).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.peRelative).toBe(48);
    expect(result.summary).toBeNull();
  });
});

describe('summarizeValuation', () => {
  it('picks conservative=min, baseCase=average, optimistic=max, and applies the margin of safety', () => {
    const result = summarizeValuation({
      dcf: 40,
      peRelative: 48,
      grahamNumber: 52,
      ddm: 44,
      marginOfSafety: 0.25
    });
    expect(result.conservative).toBe(40);
    expect(result.optimistic).toBe(52);
    expect(result.baseCase).toBeCloseTo((40 + 48 + 52 + 44) / 4, 6);
    expect(result.targetPrice).toBeCloseTo(result.baseCase * 0.75, 6);
  });
});
