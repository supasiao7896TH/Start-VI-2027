function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Broker-standard fee breakdown for one trade: commission (with a floor), fixed SET fees, and VAT on both. */
export function calculateTradeFees({ grossValue, commissionRate, minCommission, setFeeRate, vatRate }) {
  const commission = Math.max(grossValue * commissionRate, minCommission);
  const setFee = grossValue * setFeeRate;
  const vat = (commission + setFee) * vatRate;
  return { commission, setFee, vat, totalFees: commission + setFee + vat };
}

export function calculateBuyNetCashOut({ quantity, pricePerShare, feeSettings }) {
  const grossValue = quantity * pricePerShare;
  const { totalFees } = calculateTradeFees({ grossValue, ...feeSettings });
  return round2(grossValue + totalFees);
}

export function calculateSellNetCashIn({ quantity, pricePerShare, feeSettings }) {
  const grossValue = quantity * pricePerShare;
  const { totalFees } = calculateTradeFees({ grossValue, ...feeSettings });
  return round2(grossValue - totalFees);
}
