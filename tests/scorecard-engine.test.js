import { describe, expect, it } from 'vitest';
import { calculateScorecard, SCORECARD_CRITERIA } from '../src/modules/scorecard-engine.js';

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
