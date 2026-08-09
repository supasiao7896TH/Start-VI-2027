export const APP_CONFIG = Object.freeze({
  DB_NAME: 'startvi2027',
  DB_VERSION: 1,
  STORE_NAME: 'transactions',
  WITHHOLDING_TAX_RATE: 0.1,
  // Trading Fee 0.005% + Clearing Fee 0.001% + Regulatory Fee 0.001% of trade value.
  // Source: bualuang.co.th/en/announcement-lists/announcement/brokeragefees
  SET_FEE_RATE: 0.00007,
  TRADE_VAT_RATE: 0.07,
  LOCALE: 'th-TH',
  CURRENCY: 'THB',
  DEBUG: false
});
