import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_TIME_ZONE, stampDateTime, stampDay } from '../src/lib/shop-clock';

/**
 * The shop's clock is a fact about the shop.
 *
 * These modules used to ask `process.env.TZ` what zone the machine was in, which
 * did two things: it let a host running in UTC show a buyer a deadline five and a
 * half hours away from the one the staff screen printed, and on Vercel the value
 * that variable holds is a zone `Intl` refuses, so the deploy died while
 * collecting page data. Both are worth pinning down, because neither is visible
 * from the machine the code was written on.
 */

// Ten in the morning UTC is half past three in the shop's afternoon.
const morningUtc = new Date('2026-03-05T10:00:00Z');

function renderIn(zone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(at);
}

test('the shop clock is IST, not whatever the host says', () => {
  assert.equal(SHOP_TIME_ZONE, 'Asia/Kolkata');
  assert.equal(stampDateTime(morningUtc), renderIn('Asia/Kolkata', morningUtc));
});

test('the same instant is a different minute in UTC, so the zone is doing work', () => {
  assert.notEqual(stampDateTime(morningUtc), renderIn('UTC', morningUtc));
  // Half past midnight here is still the previous evening in UTC, so the two
  // calendars have to disagree about which day this is.
  const crossesMidnight = new Date('2026-03-05T19:00:00Z');
  const utcDay = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(crossesMidnight);
  assert.notEqual(stampDay(crossesMidnight), utcDay);
});

test('setting the environment time zone changes nothing the buyer is told', () => {
  const before = stampDateTime(morningUtc);
  const beforeDay = stampDay(morningUtc);
  const original = process.env.TZ;
  // The value that broke the deploy, plus a real zone that would have quietly
  // shifted every deadline instead of failing loudly.
  for (const zone of [':UTC', 'America/New_York', 'Asia/Kolkata']) {
    process.env.TZ = zone;
    try {
      assert.equal(stampDateTime(morningUtc), before, `TZ=${zone} moved the shop clock`);
      assert.equal(stampDay(morningUtc), beforeDay, `TZ=${zone} moved the shop's calendar day`);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  }
});

test('a day label carries no minute to argue about', () => {
  const label = stampDay(morningUtc);
  assert.ok(!label.includes(':'), `the day label still holds a clock time: ${label}`);
});
