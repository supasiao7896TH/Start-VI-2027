import { APP_CONFIG } from './app-config.js';

const currencyFormatter = new Intl.NumberFormat(APP_CONFIG.LOCALE, {
  style: 'currency',
  currency: APP_CONFIG.CURRENCY,
  maximumFractionDigits: 2
});

const TYPE_LABELS = {
  BUY: 'ซื้อ',
  SELL: 'ขาย',
  CASH_DIVIDEND: 'ปันผล',
  CASH_DEPOSIT_WITHDRAWAL: 'ฝาก/ถอน',
  MANUAL_ADJUSTMENT: 'ปรับยอด',
  STOCK_SPLIT: 'แตกพาร์',
  STOCK_DIVIDEND: 'หุ้นปันผล'
};

export function formatMoney(amount) {
  return currencyFormatter.format(amount ?? 0);
}

export function el(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.textContent !== undefined) node.textContent = options.textContent;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  if (options.children) {
    for (const child of options.children) node.appendChild(child);
  }
  return node;
}

export function emptyState(text) {
  return el('p', { className: 'text-sm text-slate-400 italic', textContent: text });
}

export const UI_RENDERER = {
  renderError(container, message) {
    if (!message) {
      container.classList.add('hidden');
      container.textContent = '';
      return;
    }
    container.classList.remove('hidden');
    container.textContent = message;
  },

  updateFormVisibility(form) {
    const selectedType = form.elements.type.value;
    for (const group of form.querySelectorAll('[data-for-types]')) {
      const types = group.dataset.forTypes.split(',');
      group.classList.toggle('hidden', !types.includes(selectedType));
    }
  },

  resetForm(form) {
    form.reset();
    form.elements.id.value = '';
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    document.getElementById('form-title').textContent = 'บันทึกรายการใหม่';
    document.getElementById('cancel-edit').classList.add('hidden');
    this.updateFormVisibility(form);
  },

  populateForm(form, transaction) {
    form.elements.id.value = transaction.id;
    form.elements.date.value = transaction.date;
    form.elements.type.value = transaction.type;
    if (form.elements.symbol) form.elements.symbol.value = transaction.symbol ?? '';
    if (form.elements.quantity) form.elements.quantity.value = transaction.quantity ?? '';
    if (form.elements.pricePerShare) form.elements.pricePerShare.value = transaction.pricePerShare ?? '';
    if (form.elements.netCashOut) form.elements.netCashOut.value = transaction.netCashOut ?? '';
    if (form.elements.netCashIn) form.elements.netCashIn.value = transaction.netCashIn ?? '';
    if (form.elements.direction) form.elements.direction.value = transaction.direction ?? 'DEPOSIT';
    if (form.elements.amount) form.elements.amount.value = transaction.amount ?? '';
    if (form.elements.newQuantity) form.elements.newQuantity.value = transaction.newQuantity ?? '';
    if (form.elements.newAverageCost) form.elements.newAverageCost.value = transaction.newAverageCost ?? '';
    if (form.elements.splitRatio) form.elements.splitRatio.value = transaction.splitRatio ?? '';
    if (form.elements.additionalQuantity) form.elements.additionalQuantity.value = transaction.additionalQuantity ?? '';
    if (form.elements.note) form.elements.note.value = transaction.note ?? '';
    document.getElementById('form-title').textContent = `แก้ไขรายการ #${transaction.id}`;
    document.getElementById('cancel-edit').classList.remove('hidden');
    this.updateFormVisibility(form);
  },

  /** `holdings` is expected to already be enriched via calculateUnrealizedPnL — currentPrice/currentValue/unrealizedPnL are null when no Price Snapshot exists yet. */
  renderHoldings(container, holdings) {
    container.replaceChildren();
    if (holdings.length === 0) {
      container.appendChild(emptyState('ยังไม่มี Holding'));
      return;
    }
    const table = el('table', { className: 'w-full text-sm' });
    const thead = el('thead', {
      children: [
        el('tr', {
          className: 'text-left text-slate-500 border-b border-slate-200',
          children: [
            el('th', { className: 'py-1.5 pr-3', textContent: 'หุ้น' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'จำนวน' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'ต้นทุนเฉลี่ย/หุ้น' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'ราคาล่าสุด' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'มูลค่าปัจจุบัน' }),
            el('th', { className: 'py-1.5 text-right', textContent: 'Unrealized P&L' })
          ]
        })
      ]
    });
    const tbody = el('tbody', {
      children: holdings.map((h) =>
        el('tr', {
          className: 'border-b border-slate-100 last:border-0',
          children: [
            el('td', { className: 'py-1.5 pr-3 font-medium', textContent: h.symbol }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: h.quantity.toLocaleString(APP_CONFIG.LOCALE) }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: formatMoney(h.averageCost) }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: h.currentPrice != null ? formatMoney(h.currentPrice) : '—' }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: h.currentValue != null ? formatMoney(h.currentValue) : '—' }),
            el('td', {
              className: `py-1.5 text-right font-medium ${
                h.unrealizedPnL == null ? 'text-slate-400' : h.unrealizedPnL >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`,
              textContent: h.unrealizedPnL != null ? formatMoney(h.unrealizedPnL) : '—'
            })
          ]
        })
      )
    });
    table.append(thead, tbody);
    container.appendChild(table);
  },

  renderPortfolioValueSummary(container, holdings) {
    container.replaceChildren();
    const priced = holdings.filter((h) => h.currentValue != null);
    if (priced.length === 0) {
      container.appendChild(emptyState('ยังไม่มีราคาหุ้นให้คำนวณ'));
      return;
    }
    const totalValue = priced.reduce((sum, h) => sum + h.currentValue, 0);
    const totalUnrealizedPnL = priced.reduce((sum, h) => sum + h.unrealizedPnL, 0);
    const missing = holdings.length - priced.length;
    const list = el('dl', { className: 'space-y-1.5 text-sm' });
    list.appendChild(
      el('div', {
        className: 'flex justify-between',
        children: [
          el('dt', { className: 'text-slate-500', textContent: 'มูลค่าพอร์ตรวม' }),
          el('dd', { className: 'font-medium', textContent: formatMoney(totalValue) })
        ]
      })
    );
    list.appendChild(
      el('div', {
        className: 'flex justify-between',
        children: [
          el('dt', { className: 'text-slate-500', textContent: 'Unrealized P&L รวม' }),
          el('dd', {
            className: `font-medium ${totalUnrealizedPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`,
            textContent: formatMoney(totalUnrealizedPnL)
          })
        ]
      })
    );
    container.appendChild(list);
    if (missing > 0) {
      container.appendChild(
        el('p', { className: 'text-xs text-slate-400 mt-2', textContent: `ยังไม่มีราคาให้ ${missing} หุ้น (ไม่รวมในยอดนี้)` })
      );
    }
  },

  renderCashSummary(container, cashSummary) {
    container.replaceChildren();
    const rows = [
      ['เงินฝากเข้าพอร์ตสะสม', cashSummary.totalDeposits],
      ['เงินถอนออกสะสม', cashSummary.totalWithdrawals],
      ['เงินต้นสุทธิ (Net Principal)', cashSummary.netPrincipal],
      ['ปันผลรับสุทธิสะสม', cashSummary.totalCashDividends]
    ];
    const list = el('dl', { className: 'space-y-1.5 text-sm' });
    for (const [label, value] of rows) {
      list.appendChild(
        el('div', {
          className: 'flex justify-between',
          children: [
            el('dt', { className: 'text-slate-500', textContent: label }),
            el('dd', { className: 'font-medium', textContent: formatMoney(value) })
          ]
        })
      );
    }
    container.appendChild(list);
  },

  renderRealizedPnL(container, { realizedPnL, totalRealizedPnL }) {
    container.replaceChildren();
    if (realizedPnL.length === 0) {
      container.appendChild(emptyState('ยังไม่มีรายการขาย'));
      return;
    }
    const table = el('table', { className: 'w-full text-sm' });
    const thead = el('thead', {
      children: [
        el('tr', {
          className: 'text-left text-slate-500 border-b border-slate-200',
          children: [
            el('th', { className: 'py-1.5 pr-3', textContent: 'วันที่' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'หุ้น' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'จำนวนที่ขาย' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'เงินสดรับ' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'ต้นทุน' }),
            el('th', { className: 'py-1.5 text-right', textContent: 'กำไร/ขาดทุน' })
          ]
        })
      ]
    });
    const tbody = el('tbody', {
      children: realizedPnL.map((r) =>
        el('tr', {
          className: 'border-b border-slate-100 last:border-0',
          children: [
            el('td', { className: 'py-1.5 pr-3', textContent: r.date }),
            el('td', { className: 'py-1.5 pr-3 font-medium', textContent: r.symbol }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: r.quantitySold.toLocaleString(APP_CONFIG.LOCALE) }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: formatMoney(r.proceeds) }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: formatMoney(r.costBasis) }),
            el('td', {
              className: `py-1.5 text-right font-medium ${r.realizedPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`,
              textContent: formatMoney(r.realizedPnL)
            })
          ]
        })
      )
    });
    table.append(thead, tbody);
    container.appendChild(table);
    container.appendChild(
      el('p', {
        className: `mt-3 text-sm font-semibold ${totalRealizedPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`,
        textContent: `รวม Realized P&L: ${formatMoney(totalRealizedPnL)}`
      })
    );
  },

  renderLedger(container, transactions, { onEdit, onDelete }) {
    container.replaceChildren();
    if (transactions.length === 0) {
      container.appendChild(emptyState('ยังไม่มีรายการ'));
      return;
    }
    const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const table = el('table', { className: 'w-full text-sm' });
    const thead = el('thead', {
      children: [
        el('tr', {
          className: 'text-left text-slate-500 border-b border-slate-200',
          children: [
            el('th', { className: 'py-1.5 pr-3', textContent: 'วันที่' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'ประเภท' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'หุ้น' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'รายละเอียด' }),
            el('th', { className: 'py-1.5', textContent: '' })
          ]
        })
      ]
    });
    const tbody = el('tbody');
    for (const t of sorted) {
      const editBtn = el('button', { className: 'text-slate-500 hover:text-slate-800 mr-3', textContent: 'แก้ไข' });
      editBtn.addEventListener('click', () => onEdit(t));
      const deleteBtn = el('button', { className: 'text-red-500 hover:text-red-700', textContent: 'ลบ' });
      deleteBtn.addEventListener('click', () => onDelete(t));

      tbody.appendChild(
        el('tr', {
          className: 'border-b border-slate-100 last:border-0',
          children: [
            el('td', { className: 'py-1.5 pr-3', textContent: t.date }),
            el('td', { className: 'py-1.5 pr-3', textContent: TYPE_LABELS[t.type] ?? t.type }),
            el('td', { className: 'py-1.5 pr-3 font-medium', textContent: t.symbol ?? '—' }),
            el('td', { className: 'py-1.5 pr-3 text-slate-500', textContent: describeTransaction(t) }),
            el('td', { className: 'py-1.5 text-right whitespace-nowrap', children: [editBtn, deleteBtn] })
          ]
        })
      );
    }
    table.append(thead, tbody);
    container.appendChild(table);
  }
};

function describeTransaction(t) {
  switch (t.type) {
    case 'BUY':
      return t.pricePerShare
        ? `${t.quantity?.toLocaleString(APP_CONFIG.LOCALE)} หุ้น @ ${formatMoney(t.pricePerShare)} · รวม ${formatMoney(t.netCashOut)}`
        : `${t.quantity?.toLocaleString(APP_CONFIG.LOCALE)} หุ้น · ${formatMoney(t.netCashOut)}`;
    case 'SELL':
      return t.pricePerShare
        ? `${t.quantity?.toLocaleString(APP_CONFIG.LOCALE)} หุ้น @ ${formatMoney(t.pricePerShare)} · รวม ${formatMoney(t.netCashIn)}`
        : `${t.quantity?.toLocaleString(APP_CONFIG.LOCALE)} หุ้น · ${formatMoney(t.netCashIn)}`;
    case 'CASH_DIVIDEND':
      return formatMoney(t.netCashIn);
    case 'CASH_DEPOSIT_WITHDRAWAL':
      return `${t.direction === 'DEPOSIT' ? 'ฝาก' : 'ถอน'} ${formatMoney(t.amount)}`;
    case 'MANUAL_ADJUSTMENT':
      return `qty → ${t.newQuantity ?? '—'} · avg cost → ${t.newAverageCost != null ? formatMoney(t.newAverageCost) : '—'}`;
    case 'STOCK_SPLIT':
      return `แตกพาร์ 1:${t.splitRatio}`;
    case 'STOCK_DIVIDEND':
      return `ได้เพิ่ม +${t.additionalQuantity?.toLocaleString(APP_CONFIG.LOCALE)} หุ้น`;
    default:
      return '';
  }
}

/** Pure UI-only filter — Holdings/Realized P&L/Cash Summary always use the full, unfiltered Ledger. */
export function filterTransactions(transactions, filter) {
  const { symbol, type, dateFrom, dateTo } = filter;
  return transactions.filter((t) => {
    if (symbol && !(t.symbol ?? '').toLowerCase().includes(symbol.toLowerCase())) return false;
    if (type !== 'ALL' && t.type !== type) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });
}
