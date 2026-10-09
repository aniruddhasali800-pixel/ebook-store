import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cardHostedProvider,
  parseCardWebhook,
  signCardWebhook,
  SIGNATURE_HEADER,
  type CardWebhookPayload,
} from '../src/lib/payments/card-hosted';
import { listOfferedPaymentProviders, resolvePaymentProviderId } from '../src/lib/payments/registry';
import { CARD_HOSTED_PROVIDER, UPI_DIRECT_PROVIDER } from '../src/lib/payments/types';

/**
 * The webhook contract, tested as the gateway would meet it: raw bytes plus one
 * signature header. A settlement is only honoured when the bytes it signs are
 * the bytes we received, so every attack here is a mutation of a payload that
 * was signed honestly.
 */

function signed(overrides: Partial<CardWebhookPayload> = {}) {
  const payload: CardWebhookPayload = {
    provider: CARD_HOSTED_PROVIDER,
    eventId: 'evt_001',
    orderCode: '49912',
    status: 'PAID',
    amountInPaise: 39_900,
    reference: 'TESTCARD9F2A1',
    ...overrides,
  };
  const rawBody = JSON.stringify(payload);
  return {
    rawBody,
    headers: new Headers({ [SIGNATURE_HEADER]: signCardWebhook(rawBody) }),
  };
}

function tampered(rawBody: string, signature: string) {
  return { rawBody, headers: new Headers({ [SIGNATURE_HEADER]: signature }) };
}

test('a correctly signed settlement notification normalises into a PAID event', () => {
  const event = parseCardWebhook(signed());
  assert.deepEqual(event, {
    orderCode: '49912',
    outcome: 'PAID',
    reference: 'TESTCARD9F2A1',
    amountInPaise: 39_900,
    eventId: 'evt_001',
  });
});

test('a decline normalises into FAILED and needs no reference', () => {
  const event = parseCardWebhook(signed({ status: 'FAILED', reference: '' }));
  assert.equal(event?.outcome, 'FAILED');
  assert.equal(event?.reference, undefined);
});

test('an unrecognised status is ignored rather than treated as a payment', () => {
  const rawBody = JSON.stringify({
    provider: CARD_HOSTED_PROVIDER,
    eventId: 'evt_002',
    orderCode: '49912',
    status: 'created',
    amountInPaise: 39_900,
  });
  const event = parseCardWebhook({
    rawBody,
    headers: new Headers({ [SIGNATURE_HEADER]: signCardWebhook(rawBody) }),
  });
  assert.deepEqual(event, { orderCode: '49912', outcome: 'IGNORE', eventId: 'evt_002' });
});

test('changing the amount after signing voids the signature', () => {
  const honest = signed();
  const cheap = honest.rawBody.replace('"amountInPaise":39900', '"amountInPaise":1');
  assert.notEqual(cheap, honest.rawBody, 'the mutation must actually apply');
  assert.equal(parseCardWebhook(tampered(cheap, honest.headers.get(SIGNATURE_HEADER) ?? '')), null);
});

test('a payload signed with a different key is refused', () => {
  const honest = signed();
  const otherKey = signCardWebhook(honest.rawBody + 'x');
  assert.equal(parseCardWebhook(tampered(honest.rawBody, otherKey)), null);
});

test('a missing, malformed or truncated signature is refused', () => {
  const honest = signed();
  const signature = honest.headers.get(SIGNATURE_HEADER) ?? '';

  for (const value of [
    '',
    signature.slice(0, -2),
    'sha256=' + '0'.repeat(64),
    signature.replace('sha256=', 'md5='),
  ]) {
    assert.equal(parseCardWebhook(tampered(honest.rawBody, value)), null, JSON.stringify(value));
  }
});

test('a payload from another provider or with an unusable order code is refused', () => {
  assert.equal(parseCardWebhook(signed({ provider: UPI_DIRECT_PROVIDER as never })), null);
  assert.equal(parseCardWebhook(signed({ orderCode: '49912; DROP TABLE' })), null);
  assert.equal(parseCardWebhook(signed({ orderCode: '' })), null);
  assert.equal(parseCardWebhook(signed({ amountInPaise: 39_900.5 })), null);
  assert.equal(parseCardWebhook(tampered('not json', signCardWebhook('not json'))), null);
});

test('the card adapter is only offered while the simulated gateway is enabled', () => {
  const previous = process.env.CARD_TEST_MODE;
  try {
    delete process.env.CARD_TEST_MODE;
    assert.equal(cardHostedProvider.available?.(), false);
    assert.equal(resolvePaymentProviderId(CARD_HOSTED_PROVIDER), UPI_DIRECT_PROVIDER);

    process.env.CARD_TEST_MODE = '1';
    assert.equal(cardHostedProvider.available?.(), true);
    assert.equal(resolvePaymentProviderId(CARD_HOSTED_PROVIDER), CARD_HOSTED_PROVIDER);
  } finally {
    if (previous === undefined) delete process.env.CARD_TEST_MODE;
    else process.env.CARD_TEST_MODE = previous;
  }
});

test('unknown or disabled methods fall back to the default instead of being honoured', () => {
  assert.equal(resolvePaymentProviderId('NOT_A_PROVIDER'), UPI_DIRECT_PROVIDER);
  assert.equal(resolvePaymentProviderId(undefined), UPI_DIRECT_PROVIDER);
  assert.equal(resolvePaymentProviderId({ toString: () => UPI_DIRECT_PROVIDER }), UPI_DIRECT_PROVIDER);
});

test('the till list is plain data, because it is handed to a Client Component', () => {
  const previous = process.env.CARD_TEST_MODE;
  try {
    process.env.CARD_TEST_MODE = '1';
    for (const option of listOfferedPaymentProviders()) {
      assert.deepEqual(Object.keys(option).sort(), ['id', 'label']);
    }
  } finally {
    if (previous === undefined) delete process.env.CARD_TEST_MODE;
    else process.env.CARD_TEST_MODE = previous;
  }
});

test('a card intent points at the hosted checkout and never at a card form of ours', async () => {
  const intent = await cardHostedProvider.createIntent({
    orderCode: '49912',
    orderToken: 'AbC-123_xY',
    amountInPaise: 39_900,
    currency: 'INR',
    payee: { vpa: 'demo-cafe@okhdfcbank', name: 'Demo Cafe' },
  });

  assert.equal(intent.checkoutUrl, '/card/AbC-123_xY');
  assert.equal(intent.upiUri, undefined);
  assert.equal(intent.qrDataUrl, undefined);
});

test('a card intent without an order token cannot build a checkout link', async () => {
  await assert.rejects(
    cardHostedProvider.createIntent({
      orderCode: '49912',
      amountInPaise: 39_900,
      currency: 'INR',
      payee: { vpa: 'demo-cafe@okhdfcbank', name: 'Demo Cafe' },
    }),
    /order token/,
  );
});

test('the card adapter reports unproven status, so polling can never settle it', async () => {
  const status = await cardHostedProvider.queryStatus({
    provider: CARD_HOSTED_PROVIDER,
    orderCode: '49912',
  });
  assert.equal(status.settled, false);
  assert.equal(status.statusHint, undefined);
});
