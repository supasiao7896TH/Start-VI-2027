import { describe, expect, it } from 'vitest';
import { calculateScorecard, SCORECARD_CRITERIA, suggestQuantifiableCriteria } from '../src/modules/scorecard-engine.js';

function allCriteria(value) {
  return Object.fromEntries(SCORECARD_CRITERIA.map((c) => [c.key, value]));
}

describe('calculateScorecard', () => {
  it('all 15 items checked scores 30/30 and verdicts STRONG_BUY', () => {
    const result = calculateScorecard(allCriteria(true));
    expect(result.total).toBe(30);
    expect(result.max).toBe(30);
    expect(result.verdict).toBe('STRONG_BUY');
    expect(result.byCategory).toEqual({ A: 10, B: 10, C: 6, D: 4 });
  });

  it('nothing checked scores 0/30 and verdicts PASS', () => {
    const result = calculateScorecard(allCriteria(false));
    expect(result.total).toBe(0);
    expect(result.verdict).toBe('PASS');
  });

  it('an empty criteria map (no keys at all) scores 0, not a crash', () => {
    expect(calculateScorecard({}).total).toBe(0);
  });

  it('verdict boundary: 25 is STRONG_BUY, 24 is WATCH', () => {
    // 12 items at full points (24) + one more brings it to 25... but points are always 2,
    // so hit the boundary by checking 12 items (24) then 13 items (26) and confirm the jump.
    const twelve = Object.fromEntries(SCORECARD_CRITERIA.slice(0, 12).map((c) => [c.key, true]));
    expect(calculateScorecard(twelve).total).toBe(24);
    expect(calculateScorecard(twelve).verdict).toBe('WATCH');

    const thirteen = Object.fromEntries(SCORECARD_CRITERIA.slice(0, 13).map((c) => [c.key, true]));
    expect(calculateScorecard(thirteen).total).toBe(26);
    expect(calculateScorecard(thirteen).verdict).toBe('STRONG_BUY');
  });

  it('verdict boundary: 20 is WATCH, 18 is PASS', () => {
    const nine = Object.fromEntries(SCORECARD_CRITERIA.slice(0, 9).map((c) => [c.key, true]));
    expect(calculateScorecard(nine).total).toBe(18);
    expect(calculateScorecard(nine).verdict).toBe('PASS');

    const ten = Object.fromEntries(SCORECARD_CRITERIA.slice(0, 10).map((c) => [c.key, true]));
    expect(calculateScorecard(ten).total).toBe(20);
    expect(calculateScorecard(ten).verdict).toBe('WATCH');
  });
});

describe('suggestQuantifiableCriteria', () => {
  const fullInputs = { currentPrice: 30, eps: 3, peerAveragePE: 12, fcfPerShare: 3.5, dpsNextYear: 2, baseCase: 45 };

  it('computes all 4 suggestions when every needed input is present', () => {
    const result = suggestQuantifiableCriteria(fullInputs);
    expect(result.peBelowSectorAvg).toBe(true); // 30/3=10 < 12
    expect(result.priceBelowFairValue20).toBe(true); // 30 <= 45*0.8=36
    expect(result.positiveFCF).toBe(true); // 3.5 > 0
    expect(result.yieldAbove4).toBe(true); // 2/30=6.7% > 4%
  });

  it('flips to false when the numbers don’t clear the bar', () => {
    const result = suggestQuantifiableCriteria({
      currentPrice: 50,
      eps: 3,
      peerAveragePE: 12, // 50/3=16.7 > 12
      fcfPerShare: -1, // negative
      dpsNextYear: 1, // 1/50=2% < 4%
      baseCase: 45 // 50 > 45*0.8=36
    });
    expect(result.peBelowSectorAvg).toBe(false);
    expect(result.priceBelowFairValue20).toBe(false);
    expect(result.positiveFCF).toBe(false);
    expect(result.yieldAbove4).toBe(false);
  });

  it('returns null (not false) for a criterion whose inputs are incomplete, leaving the others computable', () => {
    const result = suggestQuantifiableCriteria({ currentPrice: 30, fcfPerShare: 3.5 });
    expect(result.peBelowSectorAvg).toBeNull(); // missing eps/peerAveragePE
    expect(result.priceBelowFairValue20).toBeNull(); // missing baseCase
    expect(result.positiveFCF).toBe(true); // only needs fcfPerShare
    expect(result.yieldAbove4).toBeNull(); // missing dpsNextYear
  });

  it('a completely empty input set returns all nulls, never a crash', () => {
    expect(suggestQuantifiableCriteria({})).toEqual({
      peBelowSectorAvg: null,
      priceBelowFairValue20: null,
      positiveFCF: null,
      yieldAbove4: null
    });
  });
});
