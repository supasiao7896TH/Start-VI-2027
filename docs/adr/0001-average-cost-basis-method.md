# Use Average Cost, not FIFO, for Holding cost basis

The Ledger needs a deterministic way to compute a Holding's cost basis when partial Sells occur against multiple Buy lots. We chose Average Cost over FIFO because it matches what Thai brokers (Bualuang) already display in the client's portfolio view, so the app's numbers reconcile directly against the broker statement. FIFO's usual justification — matching tax lots for capital-gains tax — doesn't apply here, since individuals don't pay capital gains tax on SET-listed shares in Thailand.
