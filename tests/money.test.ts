import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatINR, lineTotal, paiseToRupeesString, rupeesToPaise, sumLineTotals } from '../src/lib/money';

test('paise stay exact through the UPI amount string', () => {
  assert.equal(paiseToRupeesString(49900), '499.00');
  assert.equal(paiseToRupeesString(49950), '499.50');
  assert.equal(paiseToRupeesString(5), '0.05');
  assert.equal(paiseToRupeesString(100001), '1000.01');
  // The float trap this avoids: deriving rupees from paise never drifts.
  assert.equal(paiseToRupeesString(149 * 100 + 99), '149.99');
});

test('non-integer paise is rejected rather than rounded', () => {
  assert.throws(() => paiseToRupeesString(499.5), TypeError);
});

test('rupee display uses Indian grouping', () => {
  assert.equal(formatINR(49900), '₹499.00');
  assert.equal(formatINR(10000000), '₹1,00,000.00');
  assert.equal(formatINR(14900), '₹149.00');
});

test('totals are the sum of line totals', () => {
  const items = [
    { unitPriceInPaise: 14900, quantity: 2 },
    { unitPriceInPaise: 4900, quantity: 3 },
  ];
  assert.equal(lineTotal(items[0]), 29800);
  assert.equal(sumLineTotals(items), 44500);
  assert.equal(sumLineTotals([]), 0);
});

test('absurd quantities and prices are refused', () => {
  assert.throws(() => lineTotal({ unitPriceInPaise: 100, quantity: 0 }), TypeError);
  assert.throws(() => lineTotal({ unitPriceInPaise: 100, quantity: 1.5 }), TypeError);
  assert.throws(() => lineTotal({ unitPriceInPaise: -100, quantity: 1 }), TypeError);
});

test('rupees typed by a human parse to exact paise, or not at all', () => {
  assert.equal(rupeesToPaise('399'), 39900);
  assert.equal(rupeesToPaise(' 399.5 '), 39950);
  assert.equal(rupeesToPaise('₹1,299.00'), 129900);
  assert.equal(rupeesToPaise('0.05'), 5);
  // No silent rounding, no scientific notation, no negative prices.
  for (const bad of ['', ' ', 'abc', '399.999', '-399', '1e3', '399.', '99999999']) {
    assert.equal(rupeesToPaise(bad), null, bad);
  }
});
