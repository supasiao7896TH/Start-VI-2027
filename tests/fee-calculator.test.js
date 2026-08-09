import { describe, expect, it } from 'vitest';
import { calculateBuyNetCashOut, calculateSellNetCashIn, calculateTradeFees } from '../src/modules/fee-calculator.js';

const SET_FEE_RATE = 0.00007; // 0.007%
const VAT_RATE = 0.07;

describe('calculateTradeFees', () => {
  it('commission scales with trade value when above the minimum floor', () => {
    const fees = calculateTradeFees({
      grossValue: 100000,
      commissionRate: 0.0015, // 0.15%
      minCommission: 50,
      setFeeRate: SET_FEE_RATE,
      vatRate: VAT_RATE
    });
    expect(fees.commission).toBe(150); // 100000 * 0.0015 > 50, so the rate wins
    expect(fees.setFee).toBeCloseTo(7, 5); // 100000 * 0.00007
    expect(fees.vat).toBeCloseTo((150 + 7) * 0.07, 5);
    expect(fees.totalFees).toBeCloseTo(150 + 7 + (150 + 7) * 0.07, 5);
  });

  it('minCommission floors the commission when the trade is small', () => {
    const fees = calculateTradeFees({
      grossValue: 1000,
      commissionRate: 0.0015, // 0.15% of 1000 = 1.5, below the floor
      minCommission: 50,
      setFeeRate: SET_FEE_RATE,
      vatRate: VAT_RATE
    });
    expect(fees.commission).toBe(50);
  });

  it('with commissionRate 0 (the default), only the fixed SET fee + VAT on it apply', () => {
    const fees = calculateTradeFees({
      grossValue: 100000,
      commissionRate: 0,
      minCommission: 0,
      setFeeRate: SET_FEE_RATE,
      vatRate: VAT_RATE
    });
    expect(fees.commission).toBe(0);
    expect(fees.setFee).toBeCloseTo(7, 5);
    expect(fees.vat).toBeCloseTo(7 * 0.07, 5);
  });
});

describe('calculateBuyNetCashOut / calculateSellNetCashIn', () => {
  const feeSettings = { commissionRate: 0.0015, minCommission: 50, setFeeRate: SET_FEE_RATE, vatRate: VAT_RATE };

  it('Buy net cash out is gross value PLUS fees (costs more than the raw price)', () => {
    const net = calculateBuyNetCashOut({ quantity: 100, pricePerShare: 35, feeSettings });
    const gross = 100 * 35; // 3500
    expect(net).toBeGreaterThan(gross);
    // commission = max(3500*0.0015, 50) = 50; setFee = 3500*0.00007 = 0.245; vat = (50+0.245)*0.07
    const expected = Math.round((gross + 50 + 0.245 + (50 + 0.245) * 0.07) * 100) / 100;
    expect(net).toBe(expected);
  });

  it('Sell net cash in is gross value MINUS fees (nets less than the raw price)', () => {
    const net = calculateSellNetCashIn({ quantity: 100, pricePerShare: 35, feeSettings });
    const gross = 100 * 35;
    expect(net).toBeLessThan(gross);
    const expected = Math.round((gross - (50 + 0.245 + (50 + 0.245) * 0.07)) * 100) / 100;
    expect(net).toBe(expected);
  });

  it('rounds to 2 decimal places', () => {
    const net = calculateBuyNetCashOut({
      quantity: 33,
      pricePerShare: 12.345,
      feeSettings: { commissionRate: 0.00137, minCommission: 0, setFeeRate: SET_FEE_RATE, vatRate: VAT_RATE }
    });
    expect(Number.isInteger(net * 100)).toBe(true);
  });
});
