const KEY = 'startvi2027.feeSettings';
const DEFAULTS = { commissionRate: 0, minCommission: 0 };

/** User-editable commission settings, stored client-side in localStorage. Not part of the Ledger domain — see CONTEXT.md. */
export const FEE_SETTINGS = {
  get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  },

  set(values) {
    const merged = { ...this.get(), ...values };
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }
};
