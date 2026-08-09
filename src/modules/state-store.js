function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(patch) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/**
 * Reactive Pub/Sub state. `transactions` is the raw Ledger loaded from
 * STORAGE_ENGINE; `computed` is always the output of the latest
 * LEDGER_ENGINE.replay(transactions) call — never edited directly.
 */
export const STATE_STORE = createStore({
  transactions: [],
  computed: { holdings: [], realizedPnL: [], totalRealizedPnL: 0, cashSummary: {} },
  editingId: null,
  error: null
});
