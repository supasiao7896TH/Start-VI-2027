export const TRANSACTION_TYPES = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
  CASH_DIVIDEND: 'CASH_DIVIDEND',
  CASH_DEPOSIT_WITHDRAWAL: 'CASH_DEPOSIT_WITHDRAWAL',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  STOCK_SPLIT: 'STOCK_SPLIT',
  STOCK_DIVIDEND: 'STOCK_DIVIDEND'
});

export class LedgerError extends Error {
  constructor(message, transaction) {
    super(message);
    this.name = 'LedgerError';
    this.transaction = transaction;
  }
}

function sortTransactions(transactions) {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const aTie = a.createdAt ?? 0;
    const bTie = b.createdAt ?? 0;
    if (aTie !== bTie) return aTie < bTie ? -1 : 1;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

function applyBuy(holdings, t) {
  if (!(t.quantity > 0) || !(t.netCashOut > 0)) {
    throw new LedgerError(`Buy for ${t.symbol} needs quantity > 0 and netCashOut > 0`, t);
  }
  const h = holdings.get(t.symbol) ?? { quantity: 0, averageCost: 0 };
  const newQuantity = h.quantity + t.quantity;
  const totalCostBefore = h.quantity * h.averageCost;
  const newAverageCost = (totalCostBefore + t.netCashOut) / newQuantity;
  holdings.set(t.symbol, { quantity: newQuantity, averageCost: newAverageCost });
}

function applySell(holdings, t, realizedPnL) {
  if (!(t.quantity > 0) || !(t.netCashIn > 0)) {
    throw new LedgerError(`Sell for ${t.symbol} needs quantity > 0 and netCashIn > 0`, t);
  }
  const h = holdings.get(t.symbol) ?? { quantity: 0, averageCost: 0 };
  if (t.quantity > h.quantity) {
    throw new LedgerError(
      `Sell ${t.quantity} ${t.symbol} on ${t.date} exceeds held quantity (${h.quantity})`,
      t
    );
  }
  const costBasis = h.averageCost * t.quantity;
  const proceeds = t.netCashIn;
  realizedPnL.push({
    transactionId: t.id,
    date: t.date,
    symbol: t.symbol,
    quantitySold: t.quantity,
    proceeds,
    costBasis,
    realizedPnL: proceeds - costBasis
  });
  const newQuantity = h.quantity - t.quantity;
  holdings.set(t.symbol, {
    quantity: newQuantity,
    averageCost: newQuantity === 0 ? 0 : h.averageCost
  });
}

function applyStockSplit(holdings, t) {
  const h = holdings.get(t.symbol);
  if (!h || h.quantity <= 0) {
    throw new LedgerError(`Stock Split for ${t.symbol} requires an existing Holding`, t);
  }
  if (!(t.splitRatio > 0) || t.splitRatio === 1) {
    throw new LedgerError(`Stock Split for ${t.symbol} needs a splitRatio > 0 and != 1`, t);
  }
  const newQuantity = h.quantity * t.splitRatio;
  if (!Number.isInteger(newQuantity)) {
    throw new LedgerError(
      `Stock Split ${t.splitRatio}x on ${h.quantity} ${t.symbol} does not produce a whole number of shares`,
      t
    );
  }
  holdings.set(t.symbol, { quantity: newQuantity, averageCost: h.averageCost / t.splitRatio });
}

function applyStockDividend(holdings, t) {
  const h = holdings.get(t.symbol);
  if (!h || h.quantity <= 0) {
    throw new LedgerError(`Stock Dividend for ${t.symbol} requires an existing Holding`, t);
  }
  if (!Number.isInteger(t.additionalQuantity) || t.additionalQuantity <= 0) {
    throw new LedgerError(`Stock Dividend for ${t.symbol} needs an additionalQuantity > 0`, t);
  }
  const newQuantity = h.quantity + t.additionalQuantity;
  const totalCost = h.quantity * h.averageCost;
  holdings.set(t.symbol, { quantity: newQuantity, averageCost: totalCost / newQuantity });
}

function applyManualAdjustment(holdings, t) {
  const h = holdings.get(t.symbol) ?? { quantity: 0, averageCost: 0 };
  const newQuantity = t.newQuantity ?? h.quantity;
  const newAverageCost = t.newAverageCost ?? h.averageCost;
  if (newQuantity < 0) {
    throw new LedgerError(`Manual Adjustment for ${t.symbol} cannot set quantity below 0`, t);
  }
  holdings.set(t.symbol, { quantity: newQuantity, averageCost: newAverageCost });
}

/**
 * Pure computation over the full Ledger. Holdings and Realized P&L are never
 * stored — every read replays the Transaction history from scratch so edits
 * to old Transactions always produce a consistent result (see CONTEXT.md).
 */
export const LEDGER_ENGINE = {
  replay(transactions) {
    const sorted = sortTransactions(transactions);
    const holdings = new Map();
    const realizedPnL = [];
    const cashSummary = { totalDeposits: 0, totalWithdrawals: 0, totalCashDividends: 0 };

    for (const t of sorted) {
      switch (t.type) {
        case TRANSACTION_TYPES.BUY:
          applyBuy(holdings, t);
          break;
        case TRANSACTION_TYPES.SELL:
          applySell(holdings, t, realizedPnL);
          break;
        case TRANSACTION_TYPES.CASH_DIVIDEND:
          if (!t.symbol) throw new LedgerError('Cash Dividend requires a symbol', t);
          cashSummary.totalCashDividends += t.netCashIn;
          break;
        case TRANSACTION_TYPES.CASH_DEPOSIT_WITHDRAWAL:
          if (t.direction === 'DEPOSIT') cashSummary.totalDeposits += t.amount;
          else if (t.direction === 'WITHDRAWAL') cashSummary.totalWithdrawals += t.amount;
          else throw new LedgerError(`Unknown deposit/withdrawal direction: ${t.direction}`, t);
          break;
        case TRANSACTION_TYPES.MANUAL_ADJUSTMENT:
          applyManualAdjustment(holdings, t);
          break;
        case TRANSACTION_TYPES.STOCK_SPLIT:
          applyStockSplit(holdings, t);
          break;
        case TRANSACTION_TYPES.STOCK_DIVIDEND:
          applyStockDividend(holdings, t);
          break;
        default:
          throw new LedgerError(`Unknown transaction type: ${t.type}`, t);
      }
    }

    cashSummary.netPrincipal = cashSummary.totalDeposits - cashSummary.totalWithdrawals;

    const holdingsList = [...holdings.entries()]
      .map(([symbol, v]) => ({ symbol, ...v }))
      .filter((h) => h.quantity > 0)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    return {
      holdings: holdingsList,
      realizedPnL,
      totalRealizedPnL: realizedPnL.reduce((sum, r) => sum + r.realizedPnL, 0),
      cashSummary
    };
  },

  /** Whether `quantity` of `symbol` can be sold given the already-computed holdings list. */
  canSell(holdings, symbol, quantity) {
    const h = holdings.find((x) => x.symbol === symbol);
    const available = h ? h.quantity : 0;
    return quantity > 0 && quantity <= available;
  }
};
