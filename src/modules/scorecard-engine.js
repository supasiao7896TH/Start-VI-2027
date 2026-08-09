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
