import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertTransition,
  canTransition,
  orderStatusForPaymentStatus,
  PaymentTransitionError,
} from '../src/lib/payments/status';

test('a customer may claim payment but can never reach PAID', () => {
  assert.equal(canTransition('PENDING', 'PAYMENT_VERIFICATION_PENDING', 'CUSTOMER'), true);
  assert.equal(canTransition('PENDING', 'PAID', 'CUSTOMER'), false);
  assert.equal(canTransition('PAYMENT_VERIFICATION_PENDING', 'PAID', 'CUSTOMER'), false);

  assert.throws(
    () => assertTransition('PAYMENT_VERIFICATION_PENDING', 'PAID', 'CUSTOMER'),
    (error: unknown) =>
      error instanceof PaymentTransitionError && /staff verification/i.test(error.message),
  );
});

test('a customer may cancel an un-paid order only', () => {
  assert.equal(canTransition('PENDING', 'CANCELLED', 'CUSTOMER'), true);
  assert.equal(canTransition('PAYMENT_VERIFICATION_PENDING', 'CANCELLED', 'CUSTOMER'), false);
});

test('staff may settle, fail or cancel a pending verification', () => {
  for (const to of ['PAID', 'FAILED', 'CANCELLED'] as const) {
    assert.equal(canTransition('PAYMENT_VERIFICATION_PENDING', to, 'STAFF'), true, to);
    const transition = assertTransition('PAYMENT_VERIFICATION_PENDING', to, 'STAFF');
    assert.equal(Boolean(transition.requiresReference), to === 'PAID');
  }
});

test('settled outcomes are frozen in every direction', () => {
  for (const from of ['PAID', 'FAILED', 'CANCELLED'] as const) {
    for (const to of ['PENDING', 'PAYMENT_VERIFICATION_PENDING', 'PAID', 'FAILED', 'CANCELLED'] as const) {
      for (const actor of ['CUSTOMER', 'STAFF', 'SYSTEM', 'PROVIDER'] as const) {
        assert.equal(canTransition(from, to, actor), false, `${from}->${to} as ${actor}`);
      }
    }
  }
});

test('an unknown status string is rejected instead of treated as a no-op', () => {
  assert.throws(
    () => assertTransition('PAID ' as never, 'FAILED', 'STAFF'),
    PaymentTransitionError,
  );
});

test('only a PAID payment opens the kitchen', () => {
  assert.equal(orderStatusForPaymentStatus('AWAITING_PAYMENT', 'PAID'), 'IN_KITCHEN');
  assert.equal(orderStatusForPaymentStatus('AWAITING_PAYMENT', 'PAYMENT_VERIFICATION_PENDING'), 'AWAITING_PAYMENT');
  assert.equal(orderStatusForPaymentStatus('AWAITING_PAYMENT', 'FAILED'), 'AWAITING_PAYMENT');
  assert.equal(orderStatusForPaymentStatus('IN_KITCHEN', 'PAID'), 'IN_KITCHEN');
  assert.equal(orderStatusForPaymentStatus('READY', 'CANCELLED'), 'READY');
});

test('a cancelled payment cancels an order that has not been cooked', () => {
  assert.equal(orderStatusForPaymentStatus('AWAITING_PAYMENT', 'CANCELLED'), 'CANCELLED');
  assert.equal(orderStatusForPaymentStatus('COMPLETED', 'CANCELLED'), 'COMPLETED');
});

test('a paid ebook order is delivered, never cooked', () => {
  assert.equal(orderStatusForPaymentStatus('AWAITING_PAYMENT', 'PAID', 'BOOKS'), 'COMPLETED');
  // Nothing about the book channel may put a title on the kitchen board.
  assert.notEqual(orderStatusForPaymentStatus('AWAITING_PAYMENT', 'PAID', 'BOOKS'), 'IN_KITCHEN');
  assert.equal(
    orderStatusForPaymentStatus('AWAITING_PAYMENT', 'PAYMENT_VERIFICATION_PENDING', 'BOOKS'),
    'AWAITING_PAYMENT',
  );
  assert.equal(
    orderStatusForPaymentStatus('AWAITING_PAYMENT', 'CANCELLED', 'BOOKS'),
    'CANCELLED',
  );
});
