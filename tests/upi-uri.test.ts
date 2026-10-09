import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUpiUri, isValidVpa, parseUpiUri, UpiUriError } from '../src/lib/payments/upi';

const BASE = {
  payeeVpa: 'demo-cafe@okhdfcbank',
  payeeName: 'Demo Cafe',
  amountInPaise: 49900,
  transactionRef: '12345',
};

test('builds the NPCI upi://pay URI with an exact amount', () => {
  const { uri, params } = buildUpiUri(BASE);

  assert.ok(uri.startsWith('upi://pay?'));
  assert.equal(params.pa, 'demo-cafe@okhdfcbank');
  assert.equal(params.am, '499.00');
  assert.equal(params.cu, 'INR');
  assert.equal(params.tr, '12345');
  assert.ok(!uri.includes(','), 'amount must never carry a thousands separator');
});

test('the URI a scanner reads is the URI the app builds', () => {
  const { uri } = buildUpiUri({ ...BASE, noteText: 'Order #12345' });
  assert.deepEqual(parseUpiUri(uri), {
    pa: 'demo-cafe@okhdfcbank',
    pn: 'Demo Cafe',
    am: '499.00',
    cu: 'INR',
    tr: '12345',
    tn: 'Order #12345',
    mc: undefined,
  });
});

test('values are percent-encoded so the query string cannot be broken open', () => {
  const { uri, params } = buildUpiUri({ ...BASE, payeeName: 'Sharma & Sons Dhaba' });
  assert.equal(params.pn, 'Sharma & Sons Dhaba');
  assert.ok(uri.includes('pn=Sharma%20%26%20Sons%20Dhaba'), uri);
  // Every "&" in the URI is a separator: pa, pn, am, cu, tr.
  assert.equal(uri.slice(uri.indexOf('?') + 1).split('&').length, 5);
  assert.equal(parseUpiUri(uri).pn, 'Sharma & Sons Dhaba');
});

test('rupee amounts keep their paise', () => {
  assert.equal(buildUpiUri({ ...BASE, amountInPaise: 100001 }).params.am, '1000.01');
  assert.equal(buildUpiUri({ ...BASE, amountInPaise: 49 }).params.am, '0.49');
  assert.equal(buildUpiUri({ ...BASE, amountInPaise: 500 }).params.am, '5.00');
});

test('refuses to build a payment request that would charge the wrong amount', () => {
  assert.throws(() => buildUpiUri({ ...BASE, amountInPaise: 0 }), UpiUriError);
  assert.throws(() => buildUpiUri({ ...BASE, amountInPaise: -100 }), UpiUriError);
  assert.throws(() => buildUpiUri({ ...BASE, amountInPaise: 49.99 }), UpiUriError);
});

test('refuses an invalid payee VPA', () => {
  for (const bad of ['', 'no-handle', '@ybl', 'a b@ybl', 'shop@', 'shop@bank..com']) {
    assert.equal(isValidVpa(bad), false, bad);
    assert.throws(() => buildUpiUri({ ...BASE, payeeVpa: bad }), UpiUriError, bad);
  }
  assert.equal(isValidVpa('a.b-c_1@ybl'), true);
});

test('the transaction reference stays within UPI limits', () => {
  const { params } = buildUpiUri({
    ...BASE,
    transactionRef: '12345@#$67890abcdefghij0123456789extra',
  });
  assert.ok(params.tr.length <= 35, params.tr);
  assert.match(params.tr, /^[a-zA-Z0-9-]+$/);
});

test('an over-long payee name is truncated rather than rejected', () => {
  const { params } = buildUpiUri({ ...BASE, payeeName: 'X'.repeat(120) });
  assert.equal(params.pn.length, 50);
});
