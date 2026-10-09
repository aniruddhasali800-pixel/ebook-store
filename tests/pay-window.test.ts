import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAY_WINDOW_MINUTES,
  formatPayWindow,
  payWindowAt,
  payWindowClosesAt,
} from '../src/lib/pay/window';

const CREATED = new Date('2026-10-08T05:31:04.000Z');

test('five shop minutes, timed from each order separately', () => {
  assert.equal(PAY_WINDOW_MINUTES, 5);
  assert.equal(payWindowClosesAt(CREATED).getTime(), CREATED.getTime() + 5 * 60_000);
  // Each request is timed from itself, so two orders never share a deadline.
  assert.notEqual(
    payWindowClosesAt(new Date(CREATED.getTime() + 61_000)).getTime(),
    payWindowClosesAt(CREATED).getTime(),
  );
});

test('one second in, the window is the full five minutes less that second', () => {
  const window = payWindowAt(CREATED, new Date(CREATED.getTime() + 1_000));
  assert.equal(window.open, true);
  assert.equal(window.remainingMs, 299_000);
  assert.equal(formatPayWindow(window.remainingMs), '4:59');
});

test('the last second before the deadline still counts as open', () => {
  const window = payWindowAt(CREATED, new Date(CREATED.getTime() + 5 * 60_000 - 1));
  assert.equal(window.open, true);
  assert.equal(window.remainingMs, 1);
  assert.equal(formatPayWindow(window.remainingMs), '0:01');
});

test('the deadline itself is passed, and an hour later it is still just passed', () => {
  const at = payWindowAt(CREATED, payWindowClosesAt(CREATED));
  assert.equal(at.open, false);
  assert.equal(at.remainingMs, 0);

  // A stale request must not render a negative countdown, whatever the clock skew.
  const longAgo = payWindowAt(CREATED, new Date(CREATED.getTime() + 3_600_000));
  assert.equal(longAgo.open, false);
  assert.equal(longAgo.remainingMs, 0);
  assert.equal(formatPayWindow(longAgo.remainingMs), '0:00');
});

test('a passed window carries no status, because it cancels nothing', () => {
  // The whole point of the shape: the page can show "past its time" without the
  // payment moving anywhere. Only staff verification or a gateway webhook moves it.
  assert.deepEqual(Object.keys(payWindowAt(CREATED, new Date())).sort(), [
    'closesAt',
    'open',
    'remainingMs',
  ]);
});

test('the countdown rounds up, so a timer never reads zero while time is left', () => {
  assert.equal(formatPayWindow(252_000), '4:12');
  assert.equal(formatPayWindow(251_400), '4:12');
  assert.equal(formatPayWindow(7_000), '0:07');
  assert.equal(formatPayWindow(65_000), '1:05');
});
