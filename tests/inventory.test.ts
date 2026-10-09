import test from 'node:test';
import assert from 'node:assert/strict';
import { forSale, fromCount, restock, stockState, totalShortfall, writeOff } from '../src/lib/inventory/ledger';

/**
 * These four functions are the whole contract of a shelf, and they are the part a
 * shop cannot afford to get wrong: a number that quietly goes negative reads as a
 * free sale, and a shortfall that is not written down becomes a missing bag of rice
 * nobody can explain at closing time.
 */

test('a settled order takes what the shelf has and no more', () => {
  const change = forSale(20, 3);
  assert.deepEqual(change, { deltaUnits: -3, balanceAfter: 17, shortByUnits: 0 });
});

test('selling the last of something empties it without going under', () => {
  assert.deepEqual(forSale(4, 4), { deltaUnits: -4, balanceAfter: 0, shortByUnits: 0 });
});

test('an oversold order is applied as far as it can be and the gap is recorded', () => {
  // The money has already arrived, so refusing the settlement would be the lie.
  const change = forSale(2, 6);
  assert.equal(change.balanceAfter, 0);
  assert.equal(change.deltaUnits, -2);
  assert.equal(change.shortByUnits, 4);
});

test('a sale against an empty shelf changes nothing but the shortfall', () => {
  assert.deepEqual(forSale(0, 3), { deltaUnits: 0, balanceAfter: 0, shortByUnits: 3 });
});

test('a physical count replaces the figure and the difference is what gets stored', () => {
  const change = fromCount(12, 9);
  assert.equal(change.deltaUnits, -3);
  assert.equal(change.balanceAfter, 9);
  assert.equal(change.shortByUnits, 0);
});

test('counting zero is a legitimate answer, not a missing field', () => {
  assert.deepEqual(fromCount(5, 0), { deltaUnits: -5, balanceAfter: 0, shortByUnits: 0 });
});

test('a count that agrees with the ledger moves nothing', () => {
  assert.equal(fromCount(7, 7).deltaUnits, 0);
});

test('a delivery adds and a write-off subtracts, both clamped at an empty shelf', () => {
  assert.deepEqual(restock(3, 10), { deltaUnits: 10, balanceAfter: 13, shortByUnits: 0 });
  assert.deepEqual(writeOff(8, 3), { deltaUnits: -3, balanceAfter: 5, shortByUnits: 0 });
  assert.deepEqual(writeOff(2, 5), { deltaUnits: -2, balanceAfter: 0, shortByUnits: 3 });
});

test('garbage never reaches the ledger', () => {
  // A half unit is not a thing anybody can count, and a negative order line is a
  // request to invent stock.
  assert.throws(() => forSale(10, 1.5), TypeError);
  assert.throws(() => forSale(10, 0), TypeError);
  assert.throws(() => forSale(10, -2), TypeError);
  assert.throws(() => forSale(-1, 2), TypeError);
  assert.throws(() => fromCount(10, -3), TypeError);
  assert.throws(() => fromCount(10, 2.5), TypeError);
  assert.throws(() => restock(1, 0), TypeError);
});

test('an unset reorder level is shown as unset, never as low', () => {
  assert.equal(stockState({ quantityOnHand: 0, parLevel: 0 }), 'UNSET');
  // A row that has not been given a threshold yet must not shout on every line.
  assert.equal(stockState({ quantityOnHand: 40, parLevel: 0 }), 'UNSET');
});

test('the reorder flag fires at the level, not under it', () => {
  assert.equal(stockState({ quantityOnHand: 5, parLevel: 5 }), 'LOW');
  assert.equal(stockState({ quantityOnHand: 6, parLevel: 5 }), 'OK');
  assert.equal(stockState({ quantityOnHand: 0, parLevel: 5 }), 'LOW');
});

test('shortfalls add up across a shift without editing anything', () => {
  assert.equal(totalShortfall([{ shortByUnits: 2 }, { shortByUnits: 0 }, { shortByUnits: 4 }]), 6);
  assert.equal(totalShortfall([]), 0);
});
