import type { PaymentStatus } from '@/lib/payments/status';

/**
 * Payment provider boundary.
 *
 * Order management talks to this interface only, never to UPI specifics. Going
 * from "customer pays a VPA and staff confirms" to a gateway or a provider
 * webhook means registering another adapter here — see registry.ts.
 */

export const UPI_DIRECT_PROVIDER = 'UPI_DIRECT';
export const CARD_HOSTED_PROVIDER = 'CARD_HOSTED';

export type CreateIntentInput = {
  /** Stable per-order reference sent as the UPI `tr` / gateway merchant order id. */
  orderCode: string;
  /** The order's unguessable token, for providers whose checkout is a URL. */
  orderToken?: string;
  amountInPaise: number;
  currency: string;
  payee: {
    vpa: string;
    name: string;
  };
  noteText?: string;
  merchantCode?: string;
};

export type PaymentIntent = {
  provider: string;
  orderCode: string;
  amountInPaise: number;
  currency: string;
  /** Payee actually encoded into this intent, recorded on the order. */
  payeeVpa: string;
  /** UPI deep link: rendered as a QR on desktop and opened as a scheme on mobile. */
  upiUri?: string;
  /** PNG data URL of `upiUri`, generated server-side. */
  qrDataUrl?: string;
  /** Hosted checkout page, for providers where the customer pays on a URL. */
  checkoutUrl?: string;
  /** Fields a gateway adapter would need instead (checkout url, key id, ...). */
  extra?: Record<string, string>;
};

export type ProviderStatusResult = {
  /**
   * Whether the provider itself can prove money arrived. UPI direct payment has
   * no such channel, so it is always false and settlement stays with staff
   * verification.
   */
  settled: boolean;
  statusHint?: PaymentStatus;
  reference?: string;
  message?: string;
};

/**
 * One push notification from a provider, already normalised and already trusted.
 *
 * `parseWebhook` returns this only for payloads whose signature verified; the
 * webhook route then checks `amountInPaise` against the order before anything is
 * written, so a payload that names a real order but changes its price is
 * rejected rather than honoured.
 */
export type ProviderWebhookEvent = {
  /** The same value the adapter sent as `orderCode` when it built the intent. */
  orderCode: string;
  outcome: 'PAID' | 'FAILED' | 'IGNORE';
  /** Provider transaction id, recorded on the order as `paymentReference`. */
  reference?: string;
  /** Must equal the order total, in the same integer paise the intent used. */
  amountInPaise?: number;
  /** Provider event id, so a replay can be recognised as a duplicate. */
  eventId?: string;
};

export interface PaymentProviderAdapter {
  readonly id: string;
  readonly label: string;
  /**
   * False for adapters that cannot independently confirm receipt. Adapters with
   * canSettle = false may never produce a PAID transition.
   */
  readonly canSettle: boolean;
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  /** Called by staff verification today, and by a webhook later. */
  queryStatus(intent: Pick<PaymentIntent, 'orderCode' | 'provider'>): Promise<ProviderStatusResult>;
  /**
   * False when this adapter's own configuration is absent, so the till leaves it
   * off the menu instead of offering a method that cannot take money. Adapters
   * without this hook are always offered.
   */
  available?(): boolean;
  /**
   * Only adapters that receive push notifications implement this. It verifies
   * the signature itself and returns null when the payload is not trustworthy;
   * it must never throw on a bad signature, because the route reports that as
   * an unauthorized request.
   */
  parseWebhook?(input: { rawBody: string; headers: Headers }): ProviderWebhookEvent | null;
}
