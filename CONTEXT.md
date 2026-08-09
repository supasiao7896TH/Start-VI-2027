# Start VI 2027

A personal web app for tracking and supporting decisions about Thai stock investments, styled after Value Investing with a dividend focus. Phase ① (Ledger) and Phase ② (Decision Support) are both in scope now; rental condo investments are a separate future context, not modeled here yet.

## Language

**Ledger**:
The record of everything that has actually happened in the portfolio — a sequence of Transactions. It is a system of record: facts, not opinions or projections.
_Avoid_: Journal, portfolio tracker, log

**Transaction**:
A single dated event in the Ledger that changes cash or holdings. v1 supports seven types: Buy, Sell, Cash Dividend, Cash Deposit/Withdrawal, Manual Adjustment, Stock Split, and Stock Dividend.
_Avoid_: Entry, record, event

**Buy**:
A Transaction that increases the quantity held of a stock in exchange for a net cash amount leaving the account. The net cash amount already includes broker commission/VAT — there is no separate fee field. May optionally record the raw `pricePerShare` it was bought at, purely for the user's own reference — it plays no part in the Average Cost calculation, which always comes from the net cash amount alone.

**Sell**:
A Transaction that decreases the quantity held of a stock in exchange for a net cash amount entering the account. The net cash amount already includes broker commission/VAT — there is no separate fee field. May optionally record the raw `pricePerShare` it was sold at, purely for the user's own reference — it plays no part in Realized P&L, which always comes from the net cash amount alone.

**Cash Dividend**:
A Transaction that adds cash to the account as a payout from a held stock, without changing the quantity held. Recorded net of the 10% Thai withholding tax — i.e. the actual amount credited to the account, not the gross declared dividend. Always tied to the paying stock's symbol (required, not optional).

**Cash Deposit / Withdrawal**:
A Transaction that moves cash into or out of the investment account without involving any stock. Needed to distinguish invested principal from portfolio value/returns.

**Manual Adjustment**:
A Transaction that directly overrides a Holding's quantity and/or average cost, with no cash movement and no required reason. The v1 escape hatch for Corporate Actions and any other real-world event the Ledger doesn't model yet.

**Corporate Action**:
An umbrella term for company-driven events that change a Holding's quantity or cost basis without the investor buying or selling. Stock Split and Stock Dividend are modeled as their own Transaction types (below). Rights Offering is not modeled separately — exercising it is economically a Buy, so it's recorded as one. Anything else not covered here still falls back to a Manual Adjustment.

**Stock Split**:
A Transaction that multiplies an existing Holding's quantity by a `splitRatio` (e.g. 2 for a 1:2 split) and divides its average cost by the same ratio — total cost basis is unchanged. Requires an existing Holding for the symbol; rejected outright if the ratio doesn't produce a whole number of shares.

**Stock Dividend**:
A Transaction that adds `additionalQuantity` free shares to an existing Holding, keeping total cost basis unchanged (so average cost per share decreases). Requires an existing Holding for the symbol.
_Avoid_: Bonus shares

**Holding**:
The current quantity and average cost of a single stock, derived by replaying all Buy/Sell Transactions for that stock using the Average Cost method. Not stored directly — always computed from the Ledger. Quantity is always a whole number of shares (no fractional/odd-lot shares). A Sell that would take the quantity below zero is rejected outright — the Ledger never represents a negative Holding.
_Avoid_: Position

**Realized P&L**:
Profit or loss actually locked in by a Sell Transaction (sale proceeds minus average cost of the quantity sold). Computable from the Ledger alone, with no external price data.

**Price Snapshot**:
A stock's market price at a point in time, entered manually by the user (never fetched automatically — live prices can only come from screenshots the user provides). Full history is kept, not just the latest — one symbol can have many snapshots over time. Not a Transaction: recording a price never changes a Holding's quantity or cost basis.

**Unrealized P&L**:
For a Holding, `(latest Price Snapshot price − average cost) × quantity`. Computed fresh from the Holding plus the latest Price Snapshot for that symbol — never stored. If the symbol has no Price Snapshot yet, Unrealized P&L is undefined (shown as "—"), not zero.

**VI Scorecard Entry**:
A dated evaluation of one stock — held or not — against the 15-item checklist from the `vi-analysis` skill (§22.5): 4 categories (Business & Moat /10, Financial /10, Dividend /6, Valuation /4), each item worth 0 or 2 points, no partial credit. Also carries the raw inputs (EPS, BVPS, FCF/share, WACC, growth rates, DPS, required return, current price) for the skill's 4 Valuation methods (§22.4: DCF, P/E Relative, Graham Number, DDM). Only the raw checklist answers and valuation inputs are stored — the total score, verdict, and computed fair values are always recomputed from them, the same principle as Holdings/Realized P&L never being stored directly. Independent of Price Snapshot and the Ledger; scoring an unowned stock is a normal use (it's a buy-screening tool, not just a review of existing Holdings).
_Avoid_: Watchlist entry (not modeled separately — a Scorecard Entry serves that purpose)
