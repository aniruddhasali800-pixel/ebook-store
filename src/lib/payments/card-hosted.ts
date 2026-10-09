import { createHmac, timingSafeEqual } from 'node:crypto';
import { derivedHmacKey } from '@/lib/crypto';
import {
  CARD_HOSTED_PROVIDER,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentProviderAdapter,
  type ProviderStatusResult,
  type ProviderWebhookEvent,
} from '@/lib/payments/types';

/**
 * Card payments through a hosted gateway.
 *
 * Two rules shape this file. First: card money never travels as UPI. A card is
 * authorised by the network, cleared to the merchant's *bank account* by an
 * acquirer, and reaches the seller as an NEFT/IMPS credit — so the rail here is
 * a gateway, not the VPA that `upi-direct.ts` uses. Second: this application
 * must never see a card number. The customer types it on the gateway's own
 * hosted page, which is what keeps the app outside PCI-DSS scope; an input for
 * a PAN on our own form would put us inside it.
 *
 * Because a real merchant account takes days to approve, the adapter ships with
 * a simulated gateway that produces the same webhook payload and the same
 * signature checks. It is opt-in through `CARD_TEST_MODE=1`, charges nothing,
 * and says so on every screen it renders. Swapping in Razorpay, Cashfree or
 * Paytm means writing one `createIntent` and one `parseWebhook` — the state
 * machine, the receipt page and the download gate do not change.
 *
 * No `server-only` guard on this module: the signature helpers are exercised by
 * the test suite from a plain Node process, and `node:crypto` already rules out
 * a Client Component bundle.
 */

/** Header the simulated gateway signs with. Real providers name theirs differently. */
export const SIGNATURE_HEADER = 'x-provider-signature';

export type CardWebhookPayload = {
  provider: typeof CARD_HOSTED_PROVIDER;
  eventId: string;
  orderCode: string;
  status: 'PAID' | 'FAILED';
  amountInPaise: number;
  reference: string;
};

/**
 * True only in the simulated mode. A live gateway is a separate adapter with
 * its own keys, so nothing here can quietly start accepting real cards.
 */
export function cardCheckoutEnabled(): boolean {
  return process.env.CARD_TEST_MODE === '1';
}

/**
 * Dedicated secret when provided, otherwise a key derived from this install's
 * APP_SECRET. Deriving keeps the simulated flow browsable with no extra setup
 * while still refusing payloads signed by anyone who does not hold the app's
 * own secret — there is no hardcoded fallback key.
 */
function webhookKey(): Buffer {
  const dedicated = process.env.CARD_WEBHOOK_SECRET;
  if (dedicated && dedicated.length >= 16) return Buffer.from(dedicated, 'utf8');
  return derivedHmacKey('card-webhook-signing');
}

export function signCardWebhook(rawBody: string): string {
  return `sha256=${createHmac('sha256', webhookKey()).update(rawBody).digest('hex')}`;
}

function signatureMatches(rawBody: string, header: string | null): boolean {
  const provided = header?.startsWith('sha256=') ? header.slice('sha256='.length).toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac('sha256', webhookKey()).update(rawBody).digest();
  const given = Buffer.from(provided, 'hex');
  // timingSafeEqual throws on length mismatch; the regex above already pins the
  // length, so a mismatch here can only be a malformed header.
  return given.length === expected.length && timingSafeEqual(expected, given);
}

/**
 * Verify, then normalise. Every rejection returns null so the caller can answer
 * 401 without leaking which check failed.
 */
export function parseCardWebhook(input: {
  rawBody: string;
  headers: Headers;
}): ProviderWebhookEvent | null {
  if (!signatureMatches(input.rawBody, input.headers.get(SIGNATURE_HEADER))) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const event = payload as Partial<CardWebhookPayload>;
  if (event.provider !== CARD_HOSTED_PROVIDER) return null;
  if (typeof event.orderCode !== 'string' || !/^[0-9]{4,12}$/.test(event.orderCode)) return null;
  if (typeof event.eventId !== 'string' || !event.eventId) return null;
  if (typeof event.amountInPaise !== 'number' || !Number.isInteger(event.amountInPaise)) return null;

  if (event.status === 'FAILED') {
    return {
      orderCode: event.orderCode,
      outcome: 'FAILED',
      amountInPaise: event.amountInPaise,
      eventId: event.eventId,
    };
  }
  if (event.status !== 'PAID') {
    return { orderCode: event.orderCode, outcome: 'IGNORE', eventId: event.eventId };
  }
  return {
    orderCode: event.orderCode,
    outcome: 'PAID',
    reference: typeof event.reference === 'string' && event.reference ? event.reference : undefined,
    amountInPaise: event.amountInPaise,
    eventId: event.eventId,
  };
}

export const cardHostedProvider: PaymentProviderAdapter = {
  id: CARD_HOSTED_PROVIDER,
  label: 'Card via hosted gateway checkout',
  // A gateway does observe the settlement, which is what lets its webhook settle.
  canSettle: true,

  available: cardCheckoutEnabled,

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (!input.orderToken) {
      throw new Error('Card checkout requires the order token to build its return URL.');
    }
    return {
      provider: CARD_HOSTED_PROVIDER,
      orderCode: input.orderCode,
      amountInPaise: input.amountInPaise,
      currency: input.currency,
      payeeVpa: input.payee.vpa,
      // Points at the simulated gateway page. A real adapter returns the
      // gateway's own hosted URL here instead.
      checkoutUrl: `/card/${input.orderToken}`,
      extra: {
        mode: cardCheckoutEnabled() ? 'TEST' : 'DISABLED',
        gatewayOrderRef: input.orderCode,
      },
    };
  },

  /**
   * There is no status poll for card payments: the gateway pushes the result.
   * Reporting `settled: false` is deliberate — it stops any future polling code
   * from treating a guess as a confirmation.
   */
  async queryStatus(): Promise<ProviderStatusResult> {
    return {
      settled: false,
      message: 'Card payments are reported by the gateway webhook, not by polling.',
    };
  },

  parseWebhook: parseCardWebhook,
};
