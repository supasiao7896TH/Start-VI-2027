/**
 * The 15-item VI Scorecard checklist, verbatim from the vi-analysis skill
 * (§22.5) — single source of truth used both to compute the score and to
 * render the checklist UI, so the two can never drift apart.
 */
export const SCORECARD_CRITERIA = [
  { key: 'businessUnderstandable', category: 'A', label: 'ธุรกิจเข้าใจง่าย เห็นภาพชัด', points: 2 },
  { key: 'competitiveMoat', category: 'A', label: 'มี Competitive Moat ชัดเจน', points: 2 },
  { key: 'industryPosition', category: 'A', label: 'ตำแหน่งในอุตสาหกรรมแข็งแกร่ง', points: 2 },
  { key: 'managementTrackRecord', category: 'A', label: 'ผู้บริหารน่าเชื่อถือ / Track Record', points: 2 },
  { key: 'esgGovernance', category: 'A', label: 'ESG / Governance ผ่านเกณฑ์', points: 2 },

  { key: 'roeAbove10', category: 'B', label: 'ROE > 10% ต่อเนื่อง 3 ปี', points: 2 },
  { key: 'deBelowThreshold', category: 'B', label: 'D/E < 1.5x (ปิโตรเคมี < 1.0x)', points: 2 },
  { key: 'netMarginAbove8', category: 'B', label: 'Net Margin > 8%', points: 2 },
  { key: 'revenueGrowthStable', category: 'B', label: 'Revenue เติบโต หรือ stable', points: 2 },
  { key: 'positiveFCF', category: 'B', label: 'Free Cash Flow เป็นบวก', points: 2 },

  { key: 'consistentDividend3y', category: 'C', label: 'จ่ายปันผลสม่ำเสมอ > 3 ปี', points: 2 },
  { key: 'yieldAbove4', category: 'C', label: 'Dividend Yield > 4%', points: 2 },
  { key: 'payoutRatio40to70', category: 'C', label: 'Payout Ratio 40–70%', points: 2 },

  { key: 'priceBelowFairValue20', category: 'D', label: 'ราคาต่ำกว่า Fair Value ≥ 20%', points: 2 },
  { key: 'peBelowSectorAvg', category: 'D', label: 'P/E ต่ำกว่า Sector Average', points: 2 }
];

export const SCORECARD_CATEGORY_LABELS = {
  A: 'ธุรกิจ & Moat',
  B: 'การเงิน',
  C: 'ปันผล',
  D: 'Valuation'
};

/** The 4 (of 15) criteria that are objectively computable from numbers already on the form — the rest stay pure human judgment. */
export const AUTO_SUGGESTABLE_KEYS = ['peBelowSectorAvg', 'priceBelowFairValue20', 'positiveFCF', 'yieldAbove4'];

/**
 * Suggests true/false for the 4 AUTO_SUGGESTABLE_KEYS from data the user has
 * already typed elsewhere on the Scorecard form. Any criterion whose inputs
 * aren't all present yet comes back `null` — meaning "don't touch the
 * checkbox", not "false".
 */
export function suggestQuantifiableCriteria({ currentPrice, eps, peerAveragePE, fcfPerShare, dpsNextYear, baseCase }) {
  const peBelowSectorAvg =
    Number.isFinite(currentPrice) && Number.isFinite(eps) && eps !== 0 && Number.isFinite(peerAveragePE)
      ? currentPrice / eps < peerAveragePE
      : null;

  const priceBelowFairValue20 =
    Number.isFinite(currentPrice) && Number.isFinite(baseCase) ? currentPrice <= baseCase * 0.8 : null;

  const positiveFCF = Number.isFinite(fcfPerShare) ? fcfPerShare > 0 : null;

  const yieldAbove4 =
    Number.isFinite(currentPrice) && currentPrice > 0 && Number.isFinite(dpsNextYear) ? dpsNextYear / currentPrice > 0.04 : null;

  return { peBelowSectorAvg, priceBelowFairValue20, positiveFCF, yieldAbove4 };
}

/**
 * `criteria` is a { [key]: boolean } map — matches the vi-analysis skill's
 * checkbox-only scoring (each item is worth its full points or 0, no partial
 * credit). Verdict thresholds match §22.5 exactly.
 */
export function calculateScorecard(criteria) {
  const byCategory = { A: 0, B: 0, C: 0, D: 0 };
  let total = 0;

  for (const item of SCORECARD_CRITERIA) {
    const earned = criteria[item.key] ? item.points : 0;
    byCategory[item.category] += earned;
    total += earned;
  }

  const verdict = total >= 25 ? 'STRONG_BUY' : total >= 20 ? 'WATCH' : 'PASS';

  return { total, max: 30, byCategory, verdict };
}
