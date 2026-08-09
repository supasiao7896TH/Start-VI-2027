import { APP_CONFIG } from './app-config.js';
import { STATE_STORE } from './state-store.js';
import { STORAGE_ENGINE } from './storage-engine.js';
import { LEDGER_ENGINE, LedgerError, TRANSACTION_TYPES } from './ledger-engine.js';
import { UI_RENDERER, filterTransactions } from './ui-renderer.js';
import { DEBUG_MODULE } from './debug-module.js';
import { FEE_SETTINGS } from './fee-settings.js';
import { calculateBuyNetCashOut, calculateSellNetCashIn } from './fee-calculator.js';

function toInt(value) {
  return value === '' || value == null ? NaN : parseInt(value, 10);
}

function toNumber(value) {
  return value === '' || value == null ? NaN : parseFloat(value);
}

function normalizeSymbol(value) {
  const trimmed = (value ?? '').trim().toUpperCase();
  return trimmed === '' ? undefined : trimmed;
}

function buildTransactionFromForm(form) {
  const data = new FormData(form);
  const type = data.get('type');
  const idRaw = data.get('id');
  const base = {
    ...(idRaw ? { id: Number(idRaw) } : {}),
    type,
    date: data.get('date'),
    note: data.get('note')?.trim() || undefined
  };

  switch (type) {
    case TRANSACTION_TYPES.BUY:
      return {
        ...base,
        symbol: normalizeSymbol(data.get('symbol')),
        quantity: toInt(data.get('quantity')),
        pricePerShare: data.get('pricePerShare') === '' ? undefined : toNumber(data.get('pricePerShare')),
        netCashOut: toNumber(data.get('netCashOut'))
      };
    case TRANSACTION_TYPES.SELL:
      return {
        ...base,
        symbol: normalizeSymbol(data.get('symbol')),
        quantity: toInt(data.get('quantity')),
        pricePerShare: data.get('pricePerShare') === '' ? undefined : toNumber(data.get('pricePerShare')),
        netCashIn: toNumber(data.get('netCashIn'))
      };
    case TRANSACTION_TYPES.CASH_DIVIDEND:
      return {
        ...base,
        symbol: normalizeSymbol(data.get('symbol')),
        netCashIn: toNumber(data.get('netCashIn'))
      };
    case TRANSACTION_TYPES.CASH_DEPOSIT_WITHDRAWAL:
      return {
        ...base,
        direction: data.get('direction'),
        amount: toNumber(data.get('amount'))
      };
    case TRANSACTION_TYPES.MANUAL_ADJUSTMENT: {
      const newQuantityRaw = data.get('newQuantity');
      const newAverageCostRaw = data.get('newAverageCost');
      return {
        ...base,
        symbol: normalizeSymbol(data.get('symbol')),
        newQuantity: newQuantityRaw === '' ? undefined : toInt(newQuantityRaw),
        newAverageCost: newAverageCostRaw === '' ? undefined : toNumber(newAverageCostRaw)
      };
    }
    case TRANSACTION_TYPES.STOCK_SPLIT:
      return {
        ...base,
        symbol: normalizeSymbol(data.get('symbol')),
        splitRatio: toNumber(data.get('splitRatio'))
      };
    case TRANSACTION_TYPES.STOCK_DIVIDEND:
      return {
        ...base,
        symbol: normalizeSymbol(data.get('symbol')),
        additionalQuantity: toInt(data.get('additionalQuantity'))
      };
    default:
      throw new Error(`ประเภทรายการไม่ถูกต้อง: ${type}`);
  }
}

/** Field-level checks that produce a clear Thai message before we even ask LEDGER_ENGINE. */
function validateShape(t) {
  if (!t.date) throw new Error('กรุณาระบุวันที่');

  switch (t.type) {
    case TRANSACTION_TYPES.BUY:
      if (!t.symbol) throw new Error('กรุณาระบุหุ้น');
      if (!Number.isInteger(t.quantity) || t.quantity <= 0) throw new Error('จำนวนหุ้นต้องเป็นจำนวนเต็มมากกว่า 0');
      if (t.pricePerShare !== undefined && !(t.pricePerShare > 0)) throw new Error('ราคาต่อหุ้นต้องมากกว่า 0');
      if (!(t.netCashOut > 0)) throw new Error('เงินสดจ่ายสุทธิต้องมากกว่า 0');
      return;
    case TRANSACTION_TYPES.SELL:
      if (!t.symbol) throw new Error('กรุณาระบุหุ้น');
      if (!Number.isInteger(t.quantity) || t.quantity <= 0) throw new Error('จำนวนหุ้นต้องเป็นจำนวนเต็มมากกว่า 0');
      if (t.pricePerShare !== undefined && !(t.pricePerShare > 0)) throw new Error('ราคาต่อหุ้นต้องมากกว่า 0');
      if (!(t.netCashIn > 0)) throw new Error('เงินสดรับสุทธิต้องมากกว่า 0');
      return;
    case TRANSACTION_TYPES.CASH_DIVIDEND:
      if (!t.symbol) throw new Error('กรุณาระบุหุ้นที่จ่ายปันผล');
      if (!(t.netCashIn > 0)) throw new Error('เงินปันผลสุทธิต้องมากกว่า 0');
      return;
    case TRANSACTION_TYPES.CASH_DEPOSIT_WITHDRAWAL:
      if (t.direction !== 'DEPOSIT' && t.direction !== 'WITHDRAWAL') throw new Error('กรุณาเลือกทิศทางฝาก/ถอน');
      if (!(t.amount > 0)) throw new Error('จำนวนเงินต้องมากกว่า 0');
      return;
    case TRANSACTION_TYPES.MANUAL_ADJUSTMENT:
      if (!t.symbol) throw new Error('กรุณาระบุหุ้น');
      if (t.newQuantity === undefined && t.newAverageCost === undefined) {
        throw new Error('กรุณาระบุจำนวนหุ้นใหม่หรือต้นทุนเฉลี่ยใหม่อย่างน้อยหนึ่งอย่าง');
      }
      if (t.newQuantity !== undefined && (!Number.isInteger(t.newQuantity) || t.newQuantity < 0)) {
        throw new Error('จำนวนหุ้นใหม่ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
      }
      if (t.newAverageCost !== undefined && !(t.newAverageCost >= 0)) {
        throw new Error('ต้นทุนเฉลี่ยใหม่ต้องตั้งแต่ 0 ขึ้นไป');
      }
      return;
    case TRANSACTION_TYPES.STOCK_SPLIT:
      if (!t.symbol) throw new Error('กรุณาระบุหุ้น');
      if (!(t.splitRatio > 0) || t.splitRatio === 1) throw new Error('อัตราส่วนแตกพาร์ต้องมากกว่า 0 และไม่เท่ากับ 1');
      return;
    case TRANSACTION_TYPES.STOCK_DIVIDEND:
      if (!t.symbol) throw new Error('กรุณาระบุหุ้น');
      if (!Number.isInteger(t.additionalQuantity) || t.additionalQuantity <= 0) {
        throw new Error('จำนวนหุ้นที่ได้เพิ่มต้องเป็นจำนวนเต็มมากกว่า 0');
      }
      return;
    default:
      throw new Error('ประเภทรายการไม่ถูกต้อง');
  }
}

/** Re-runs the full Ledger with this transaction included, so oversell / bad edits are caught before saving. */
function validateAgainstLedger(candidate, existingTransactions) {
  const existing = existingTransactions.find((t) => t.id === candidate.id);
  const rest = existingTransactions.filter((t) => t.id !== candidate.id);
  // Preserve the original createdAt on edit — otherwise the what-if replay would
  // re-sort the edited transaction to "now", silently reordering it after later ones.
  const whatIf = [
    ...rest,
    { ...candidate, id: candidate.id ?? Infinity, createdAt: existing?.createdAt ?? Date.now() }
  ];
  try {
    LEDGER_ENGINE.replay(whatIf);
  } catch (err) {
    if (err instanceof LedgerError) throw new Error(err.message);
    throw err;
  }
}

function recompute() {
  const { transactions } = STATE_STORE.getState();
  try {
    const computed = LEDGER_ENGINE.replay(transactions);
    STATE_STORE.setState({ computed, error: null });
  } catch (err) {
    DEBUG_MODULE.error('Replay failed', err);
    STATE_STORE.setState({
      error: err instanceof LedgerError ? err.message : 'เกิดข้อผิดพลาดในการคำนวณ Ledger'
    });
  }
}

function render(dom) {
  const state = STATE_STORE.getState();
  UI_RENDERER.renderError(dom.errorBanner, state.error);
  UI_RENDERER.renderHoldings(dom.holdingsTable, state.computed.holdings);
  UI_RENDERER.renderCashSummary(dom.cashSummary, state.computed.cashSummary);
  UI_RENDERER.renderRealizedPnL(dom.realizedPnLTable, state.computed);
  UI_RENDERER.renderLedger(dom.ledgerTable, filterTransactions(state.transactions, state.ledgerFilter), {
    onEdit: (t) => UI_RENDERER.populateForm(dom.form, t),
    onDelete: (t) => handleDelete(t, dom)
  });
}

async function loadTransactions() {
  const transactions = await STORAGE_ENGINE.getAll();
  STATE_STORE.setState({ transactions });
  recompute();
}

async function handleSubmit(event, dom) {
  event.preventDefault();
  let candidate;
  try {
    candidate = buildTransactionFromForm(dom.form);
    validateShape(candidate);
    validateAgainstLedger(candidate, STATE_STORE.getState().transactions);
  } catch (err) {
    STATE_STORE.setState({ error: err.message });
    render(dom);
    return;
  }

  try {
    if (candidate.id) {
      const { id, ...changes } = candidate;
      await STORAGE_ENGINE.update(id, changes);
    } else {
      await STORAGE_ENGINE.add(candidate);
    }
    await loadTransactions();
    UI_RENDERER.resetForm(dom.form);
    render(dom);
  } catch (err) {
    DEBUG_MODULE.error('Save failed', err);
    STATE_STORE.setState({ error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
    render(dom);
  }
}

async function handleDelete(transaction, dom) {
  const confirmed = window.confirm(`ลบรายการ #${transaction.id} (${transaction.type}) ใช่ไหม?`);
  if (!confirmed) return;
  try {
    await STORAGE_ENGINE.remove(transaction.id);
    await loadTransactions();
    render(dom);
  } catch (err) {
    DEBUG_MODULE.error('Delete failed', err);
    STATE_STORE.setState({ error: 'ลบรายการไม่สำเร็จ กรุณาลองใหม่' });
    render(dom);
  }
}

/** Fills netCashOut/netCashIn from quantity × pricePerShare ± broker fees. Only called from input listeners — never on populateForm — so opening an old record for edit never silently overwrites its stored net cash. */
function recalculateNetCash(form) {
  const type = form.elements.type.value;
  if (type !== TRANSACTION_TYPES.BUY && type !== TRANSACTION_TYPES.SELL) return;

  const quantity = toInt(form.elements.quantity.value);
  const pricePerShare = toNumber(form.elements.pricePerShare.value);
  if (!(quantity > 0) || !(pricePerShare > 0)) return;

  const userSettings = FEE_SETTINGS.get();
  const feeSettings = {
    commissionRate: (userSettings.commissionRate ?? 0) / 100,
    minCommission: userSettings.minCommission ?? 0,
    setFeeRate: APP_CONFIG.SET_FEE_RATE,
    vatRate: APP_CONFIG.TRADE_VAT_RATE
  };

  if (type === TRANSACTION_TYPES.BUY) {
    form.elements.netCashOut.value = calculateBuyNetCashOut({ quantity, pricePerShare, feeSettings });
  } else {
    form.elements.netCashIn.value = calculateSellNetCashIn({ quantity, pricePerShare, feeSettings });
  }
}

function handleExport() {
  const { transactions } = STATE_STORE.getState();
  const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `start-vi-2027-ledger-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Validates the whole imported file — shape of every transaction AND that they replay cleanly together — before touching IndexedDB at all. */
async function handleImport(file, dom) {
  let parsed;
  try {
    const text = await readFileAsText(file);
    parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('ไฟล์ต้องเป็น array ของรายการ');
    parsed.forEach((t, i) => {
      if (!Object.values(TRANSACTION_TYPES).includes(t.type)) {
        throw new Error(`รายการที่ ${i + 1}: ประเภท "${t.type}" ไม่ถูกต้อง`);
      }
      try {
        validateShape(t);
      } catch (err) {
        throw new Error(`รายการที่ ${i + 1} (${t.symbol ?? t.type}): ${err.message}`);
      }
    });
    LEDGER_ENGINE.replay(parsed);
  } catch (err) {
    STATE_STORE.setState({ error: `Import ไม่สำเร็จ: ${err.message}` });
    render(dom);
    return;
  }

  const existingCount = STATE_STORE.getState().transactions.length;
  const confirmed = window.confirm(
    `จะแทนที่รายการเดิม ${existingCount} รายการ ด้วยรายการที่ import มา ${parsed.length} รายการ ต้องการดำเนินการต่อหรือไม่?`
  );
  if (!confirmed) return;

  try {
    await STORAGE_ENGINE.replaceAll(parsed);
    await loadTransactions();
    render(dom);
  } catch (err) {
    DEBUG_MODULE.error('Import failed', err);
    STATE_STORE.setState({ error: 'Import ไม่สำเร็จ กรุณาลองใหม่' });
    render(dom);
  }
}

export const APP_CORE = {
  async init() {
    const dom = {
      form: document.getElementById('transaction-form'),
      cancelEditBtn: document.getElementById('cancel-edit'),
      exportBtn: document.getElementById('export-json'),
      errorBanner: document.getElementById('error-banner'),
      holdingsTable: document.getElementById('holdings-table'),
      cashSummary: document.getElementById('cash-summary'),
      realizedPnLTable: document.getElementById('realized-pnl-table'),
      ledgerTable: document.getElementById('ledger-table'),
      feeCommissionRate: document.getElementById('fee-commission-rate'),
      feeMinCommission: document.getElementById('fee-min-commission'),
      importBtn: document.getElementById('import-json'),
      importFileInput: document.getElementById('import-file-input'),
      filterSymbol: document.getElementById('filter-symbol'),
      filterType: document.getElementById('filter-type'),
      filterDateFrom: document.getElementById('filter-date-from'),
      filterDateTo: document.getElementById('filter-date-to'),
      filterClearBtn: document.getElementById('filter-clear')
    };

    dom.form.elements.type.addEventListener('change', () => UI_RENDERER.updateFormVisibility(dom.form));
    dom.form.addEventListener('submit', (event) => handleSubmit(event, dom));
    dom.form.elements.quantity.addEventListener('input', () => recalculateNetCash(dom.form));
    dom.form.elements.pricePerShare.addEventListener('input', () => recalculateNetCash(dom.form));
    dom.cancelEditBtn.addEventListener('click', () => {
      UI_RENDERER.resetForm(dom.form);
      STATE_STORE.setState({ error: null });
      render(dom);
    });
    dom.exportBtn.addEventListener('click', handleExport);
    dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
    dom.importFileInput.addEventListener('change', () => {
      const file = dom.importFileInput.files[0];
      dom.importFileInput.value = '';
      if (file) handleImport(file, dom);
    });

    const onFilterChange = () => {
      STATE_STORE.setState({
        ledgerFilter: {
          symbol: dom.filterSymbol.value,
          type: dom.filterType.value,
          dateFrom: dom.filterDateFrom.value,
          dateTo: dom.filterDateTo.value
        }
      });
      render(dom);
    };
    dom.filterSymbol.addEventListener('input', onFilterChange);
    dom.filterType.addEventListener('change', onFilterChange);
    dom.filterDateFrom.addEventListener('change', onFilterChange);
    dom.filterDateTo.addEventListener('change', onFilterChange);
    dom.filterClearBtn.addEventListener('click', () => {
      dom.filterSymbol.value = '';
      dom.filterType.value = 'ALL';
      dom.filterDateFrom.value = '';
      dom.filterDateTo.value = '';
      onFilterChange();
    });

    const initialFeeSettings = FEE_SETTINGS.get();
    dom.feeCommissionRate.value = initialFeeSettings.commissionRate;
    dom.feeMinCommission.value = initialFeeSettings.minCommission;
    const onFeeSettingsChange = () => {
      FEE_SETTINGS.set({
        commissionRate: toNumber(dom.feeCommissionRate.value) || 0,
        minCommission: toNumber(dom.feeMinCommission.value) || 0
      });
      recalculateNetCash(dom.form);
    };
    dom.feeCommissionRate.addEventListener('change', onFeeSettingsChange);
    dom.feeMinCommission.addEventListener('change', onFeeSettingsChange);

    UI_RENDERER.resetForm(dom.form);

    try {
      await loadTransactions();
    } catch (err) {
      DEBUG_MODULE.error('Failed to load transactions', err);
      STATE_STORE.setState({ error: 'โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า' });
    }
    render(dom);
  }
};
