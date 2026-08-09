import { LEDGER_ENGINE, TRANSACTION_TYPES } from './ledger-engine.js';

export class ValuationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValuationError';
  }
}

/**
 * Suggests a next-year DPS from the most recent real Cash Dividend the
 * Ledger has for `symbol` — net cash received divided by the quantity held
 * at that point in time (replaying the Ledger up to that date). Returns null
 * if the symbol has never paid a dividend in this Ledger.
 */
export function getSuggestedDividendPerShare(transactions, symbol) {
  const dividends = transactions.filter((t) => t.type === TRANSACTION_TYPES.CASH_DIVIDEND && t.symbol === symbol);
  if (dividends.length === 0) return null;

  const latest = dividends.reduce((best, t) => {
    if (t.date !== best.date) return t.date > best.date ? t : best;
    return (t.createdAt ?? 0) > (best.createdAt ?? 0) ? t : best;
  });

  const upToLatest = transactions.filter(
    (t) => t.date < latest.date || (t.date === latest.date && (t.createdAt ?? 0) <= (latest.createdAt ?? 0))
  );

  let holdings;
  try {
    ({ holdings } = LEDGER_ENGINE.replay(upToLatest));
  } catch {
    return null;
  }

  const holding = holdings.find((h) => h.symbol === symbol);
  if (!holding || holding.quantity <= 0) return null;
  return latest.netCashIn / holding.quantity;
}

/** Latest known price for `symbol` from Price Snapshot history (max asOfDate, tie-break createdAt), or null if none exists. */
export function getLatestPrice(priceSnapshots, symbol) {
  const matches = priceSnapshots.filter((p) => p.symbol === symbol);
  if (matches.length === 0) return null;
  const latest = matches.reduce((best, p) => {
    if (p.asOfDate !== best.asOfDate) return p.asOfDate > best.asOfDate ? p : best;
    return (p.createdAt ?? 0) > (best.createdAt ?? 0) ? p : best;
  });
  return latest.price;
}

/** Adds currentPrice/currentValue/unrealizedPnL to each Holding. Fields are null when no Price Snapshot exists for that symbol — the Ledger itself never needs a live price to be correct. */
export function calculateUnrealizedPnL(holdings, priceSnapshots) {
  return holdings.map((h) => {
    const currentPrice = getLatestPrice(priceSnapshots, h.symbol);
    if (currentPrice == null) {
      return { ...h, currentPrice: null, currentValue: null, unrealizedPnL: null };
    }
    const currentValue = currentPrice * h.quantity;
    const costValue = h.averageCost * h.quantity;
    return { ...h, currentPrice, currentValue, unrealizedPnL: currentValue - costValue };
  });
}

/**
 * Two-stage DCF: projects FCF forward 5 years at growthRate5y, discounts each
 * year at wacc, adds a Gordon Growth terminal value discounted back to present.
 * Matches vi-analysis skill §22.4 method 1.
 */
export function calculateDCF({ fcfPerShare, wacc, growthRate5y, terminalGrowthRate }) {
  if (!(wacc > terminalGrowthRate)) {
    throw new ValuationError('WACC ต้องมากกว่า Terminal Growth Rate ไม่งั้นสูตร Terminal Value จะพัง');
  }
  const YEARS = 5;
  let pvSum = 0;
  let fcf = fcfPerShare;
  for (let t = 1; t <= YEARS; t++) {
    fcf *= 1 + growthRate5y;
    pvSum += fcf / (1 + wacc) ** t;
  }
  const terminalValue = (fcf * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  const pvTerminal = terminalValue / (1 + wacc) ** YEARS;
  return pvSum + pvTerminal;
}

/** Fair Value = EPS × Peer Average P/E. Matches vi-analysis skill §22.4 method 2. */
export function calculatePERelative({ eps, peerAveragePE }) {
  return eps * peerAveragePE;
}

/** Graham Number = √(22.5 × EPS × BVPS). Matches vi-analysis skill §22.4 method 3. */
export function calculateGrahamNumber({ eps, bvps }) {
  if (!(eps > 0) || !(bvps > 0)) {
    throw new ValuationError('Graham Number ต้องการ EPS และ BVPS ที่มากกว่า 0');
  }
  return Math.sqrt(22.5 * eps * bvps);
}

/** DDM = DPS(next year) / (requiredReturn − dividendGrowthRate). Matches vi-analysis skill §22.4 method 4. */
export function calculateDDM({ dpsNextYear, requiredReturn, dividendGrowthRate }) {
  if (!(requiredReturn > dividendGrowthRate)) {
    throw new ValuationError('Required Return ต้องมากกว่า Dividend Growth Rate ไม่งั้นสูตร DDM จะพัง');
  }
  return dpsNextYear / (requiredReturn - dividendGrowthRate);
}

/**
 * Conservative = lowest of the 4 methods, Base Case = average, Optimistic = highest.
 * Target Price = Base Case discounted by the Margin of Safety.
 * Matches vi-analysis skill §22.4 "สรุป Valuation Range".
 */
export function summarizeValuation({ dcf, peRelative, grahamNumber, ddm, marginOfSafety }) {
  const values = [dcf, peRelative, grahamNumber, ddm];
  const conservative = Math.min(...values);
  const optimistic = Math.max(...values);
  const baseCase = values.reduce((sum, v) => sum + v, 0) / values.length;
  const targetPrice = baseCase * (1 - marginOfSafety);
  return { conservative, baseCase, optimistic, targetPrice };
}

/**
 * Lenient version of the 4 methods — never throws. Each method that can't be
 * computed (missing input → NaN, or a guard failure) comes back `null`
 * instead of blocking the others. `summary` is only present once all 4 are
 * available. Built for live "fill in the form" UIs and for replaying old
 * Scorecard entries whose inputs might be incomplete.
 */
export function calculateAllValuations(inputs) {
  const errors = [];
  const hasAll = (keys) => keys.every((key) => Number.isFinite(inputs[key]));

  // Only attempt (and thus only ever report an error for) a method once the user
  // has actually filled in every field it needs — an untouched/partial form should
  // show "—", not a wall of validation warnings.
  const tryCalc = (fn, requiredKeys) => {
    if (!hasAll(requiredKeys)) return null;
    try {
      const result = fn(inputs);
      return Number.isFinite(result) ? result : null;
    } catch (err) {
      errors.push(err.message);
      return null;
    }
  };

  const dcf = tryCalc(calculateDCF, ['fcfPerShare', 'wacc', 'growthRate5y', 'terminalGrowthRate']);
  const peRelative = tryCalc(calculatePERelative, ['eps', 'peerAveragePE']);
  const grahamNumber = tryCalc(calculateGrahamNumber, ['eps', 'bvps']);
  const ddm = tryCalc(calculateDDM, ['dpsNextYear', 'requiredReturn', 'dividendGrowthRate']);

  let summary = null;
  if (dcf != null && peRelative != null && grahamNumber != null && ddm != null && Number.isFinite(inputs.marginOfSafety)) {
    summary = summarizeValuation({ dcf, peRelative, grahamNumber, ddm, marginOfSafety: inputs.marginOfSafety });
  }

  return { dcf, peRelative, grahamNumber, ddm, summary, errors };
}
