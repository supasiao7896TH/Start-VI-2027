import { el, emptyState, formatMoney } from './ui-renderer.js';
import { AUTO_SUGGESTABLE_KEYS, SCORECARD_CATEGORY_LABELS, SCORECARD_CRITERIA } from './scorecard-engine.js';

const VERDICT_LABELS = {
  STRONG_BUY: '✅ น่าสนใจมาก (Strong Buy)',
  WATCH: '🟡 น่าติดตาม (Watch)',
  PASS: '❌ ยังไม่น่าลงทุน (Pass)'
};

const VALUATION_ROW_LABELS = [
  ['dcf', 'DCF'],
  ['peRelative', 'P/E Relative'],
  ['grahamNumber', 'Graham Number'],
  ['ddm', 'DDM']
];

export const DECISION_SUPPORT_RENDERER = {
  resetPriceForm(form) {
    form.reset();
    form.elements.id.value = '';
    form.elements.asOfDate.value = new Date().toISOString().slice(0, 10);
    document.getElementById('price-form-title').textContent = 'บันทึกราคาหุ้น (Price Snapshot)';
    document.getElementById('price-cancel-edit').classList.add('hidden');
  },

  populatePriceForm(form, snapshot) {
    form.elements.id.value = snapshot.id;
    form.elements.symbol.value = snapshot.symbol ?? '';
    form.elements.price.value = snapshot.price ?? '';
    form.elements.asOfDate.value = snapshot.asOfDate ?? '';
    form.elements.note.value = snapshot.note ?? '';
    document.getElementById('price-form-title').textContent = `แก้ไขราคา #${snapshot.id}`;
    document.getElementById('price-cancel-edit').classList.remove('hidden');
  },

  renderPriceHistory(container, snapshots, { onEdit, onDelete }) {
    container.replaceChildren();
    if (snapshots.length === 0) {
      container.appendChild(emptyState('ยังไม่มีราคาบันทึกไว้'));
      return;
    }
    const sorted = [...snapshots].sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : a.asOfDate > b.asOfDate ? -1 : 0));
    const table = el('table', { className: 'w-full text-sm' });
    const thead = el('thead', {
      children: [
        el('tr', {
          className: 'text-left text-slate-500 border-b border-slate-200',
          children: [
            el('th', { className: 'py-1.5 pr-3', textContent: 'ณ วันที่' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'หุ้น' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'ราคา' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'หมายเหตุ' }),
            el('th', { className: 'py-1.5', textContent: '' })
          ]
        })
      ]
    });
    const tbody = el('tbody');
    for (const s of sorted) {
      const editBtn = el('button', { className: 'text-slate-500 hover:text-slate-800 mr-3', textContent: 'แก้ไข' });
      editBtn.addEventListener('click', () => onEdit(s));
      const deleteBtn = el('button', { className: 'text-red-500 hover:text-red-700', textContent: 'ลบ' });
      deleteBtn.addEventListener('click', () => onDelete(s));
      tbody.appendChild(
        el('tr', {
          className: 'border-b border-slate-100 last:border-0',
          children: [
            el('td', { className: 'py-1.5 pr-3', textContent: s.asOfDate }),
            el('td', { className: 'py-1.5 pr-3 font-medium', textContent: s.symbol }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: formatMoney(s.price) }),
            el('td', { className: 'py-1.5 pr-3 text-slate-500', textContent: s.note ?? '' }),
            el('td', { className: 'py-1.5 text-right whitespace-nowrap', children: [editBtn, deleteBtn] })
          ]
        })
      );
    }
    table.append(thead, tbody);
    container.appendChild(table);
  },

  resetScorecardForm(form) {
    form.reset();
    form.elements.id.value = '';
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    document.getElementById('scorecard-form-title').textContent = 'VI Scorecard & Valuation';
    document.getElementById('scorecard-cancel-edit').classList.add('hidden');
  },

  populateScorecardForm(form, entry) {
    form.elements.id.value = entry.id;
    form.elements.symbol.value = entry.symbol ?? '';
    form.elements.date.value = entry.date ?? '';
    form.elements.currentPrice.value = entry.currentPrice ?? '';
    form.elements.note.value = entry.note ?? '';
    const v = entry.valuationInputs ?? {};
    for (const key of ['eps', 'bvps', 'peerAveragePE', 'fcfPerShare', 'wacc', 'growthRate5y', 'terminalGrowthRate', 'marginOfSafety', 'dpsNextYear', 'requiredReturn', 'dividendGrowthRate']) {
      form.elements[key].value = v[key] ?? '';
    }
    const criteria = entry.criteria ?? {};
    for (const item of SCORECARD_CRITERIA) {
      form.elements[item.key].checked = Boolean(criteria[item.key]);
    }
    document.getElementById('scorecard-form-title').textContent = `แก้ไข Scorecard #${entry.id}`;
    document.getElementById('scorecard-cancel-edit').classList.remove('hidden');
  },

  /** Builds the 15-checkbox checklist once from SCORECARD_CRITERIA — called at init only, never re-rendered (values are set/read via the form itself). */
  buildScorecardChecklist(container) {
    container.replaceChildren();
    for (const category of ['A', 'B', 'C', 'D']) {
      const items = SCORECARD_CRITERIA.filter((c) => c.category === category);
      const maxPoints = items.reduce((sum, c) => sum + c.points, 0);
      const group = el('div', { className: 'mb-4 last:mb-0' });
      group.appendChild(
        el('h4', {
          className: 'text-sm font-medium text-slate-600 mb-2',
          textContent: `หมวด ${category}: ${SCORECARD_CATEGORY_LABELS[category]} (${maxPoints} คะแนน)`
        })
      );
      for (const item of items) {
        const checkbox = el('input', { className: 'rounded', attrs: { type: 'checkbox', name: item.key } });
        const label = el('label', { className: 'flex items-center gap-2 text-sm py-1' });
        label.appendChild(checkbox);
        const suffix = AUTO_SUGGESTABLE_KEYS.includes(item.key) ? ' — 💡 แนะนำอัตโนมัติ' : '';
        label.appendChild(document.createTextNode(`${item.label} (/${item.points})${suffix}`));
        group.appendChild(label);
      }
      container.appendChild(group);
    }
  },

  renderScorecardTotals(container, scoreResult) {
    container.replaceChildren();
    container.appendChild(
      el('p', {
        textContent: `รวม: ${scoreResult.total}/${scoreResult.max} → ${VERDICT_LABELS[scoreResult.verdict]}`
      })
    );
  },

  /** `results` is the output of valuation-engine's calculateAllValuations() — each method is a number or null, plus an optional summary and error messages. */
  renderValuationSummary(container, results) {
    container.replaceChildren();
    const list = el('dl', { className: 'space-y-1' });
    for (const [key, label] of VALUATION_ROW_LABELS) {
      list.appendChild(
        el('div', {
          className: 'flex justify-between',
          children: [
            el('dt', { className: 'text-slate-500', textContent: label }),
            el('dd', { className: 'font-medium', textContent: results[key] != null ? formatMoney(results[key]) : '—' })
          ]
        })
      );
    }
    container.appendChild(list);

    if (results.summary) {
      container.appendChild(
        el('div', {
          className: 'flex justify-between mt-2 pt-2 border-t border-slate-200',
          children: [
            el('dt', { className: 'font-semibold', textContent: 'Base Case' }),
            el('dd', { className: 'font-semibold', textContent: formatMoney(results.summary.baseCase) })
          ]
        })
      );
      container.appendChild(
        el('div', {
          className: 'flex justify-between font-semibold text-emerald-700',
          children: [
            el('span', { textContent: 'ราคาเป้าหมาย (หลัง MoS)' }),
            el('span', { textContent: formatMoney(results.summary.targetPrice) })
          ]
        })
      );
    }

    for (const message of results.errors ?? []) {
      container.appendChild(el('p', { className: 'text-xs text-amber-600 mt-1', textContent: `⚠ ${message}` }));
    }
  },

  /** `rows` = [{ entry, score, targetPrice }], pre-computed by app-core so this stays pure DOM. */
  renderScorecardHistory(container, rows, { onEdit, onDelete }) {
    container.replaceChildren();
    if (rows.length === 0) {
      container.appendChild(emptyState('ยังไม่มี Scorecard บันทึกไว้'));
      return;
    }
    const sorted = [...rows].sort((a, b) => (a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : 0));
    const table = el('table', { className: 'w-full text-sm' });
    const thead = el('thead', {
      children: [
        el('tr', {
          className: 'text-left text-slate-500 border-b border-slate-200',
          children: [
            el('th', { className: 'py-1.5 pr-3', textContent: 'วันที่' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'หุ้น' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'คะแนน' }),
            el('th', { className: 'py-1.5 pr-3', textContent: 'ผล' }),
            el('th', { className: 'py-1.5 pr-3 text-right', textContent: 'ราคาเป้าหมาย' }),
            el('th', { className: 'py-1.5', textContent: '' })
          ]
        })
      ]
    });
    const tbody = el('tbody');
    for (const row of sorted) {
      const editBtn = el('button', { className: 'text-slate-500 hover:text-slate-800 mr-3', textContent: 'แก้ไข' });
      editBtn.addEventListener('click', () => onEdit(row.entry));
      const deleteBtn = el('button', { className: 'text-red-500 hover:text-red-700', textContent: 'ลบ' });
      deleteBtn.addEventListener('click', () => onDelete(row.entry));
      tbody.appendChild(
        el('tr', {
          className: 'border-b border-slate-100 last:border-0',
          children: [
            el('td', { className: 'py-1.5 pr-3', textContent: row.entry.date }),
            el('td', { className: 'py-1.5 pr-3 font-medium', textContent: row.entry.symbol }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: `${row.score.total}/${row.score.max}` }),
            el('td', { className: 'py-1.5 pr-3', textContent: VERDICT_LABELS[row.score.verdict] }),
            el('td', { className: 'py-1.5 pr-3 text-right', textContent: row.targetPrice != null ? formatMoney(row.targetPrice) : '—' }),
            el('td', { className: 'py-1.5 text-right whitespace-nowrap', children: [editBtn, deleteBtn] })
          ]
        })
      );
    }
    table.append(thead, tbody);
    container.appendChild(table);
  }
};
