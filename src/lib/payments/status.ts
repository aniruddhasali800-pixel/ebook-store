/**
 * The single source of truth for payment and order lifecycles.
 *
 * The security rule this file encodes: a customer action can never produce a
 * PAID payment. Generating a QR, opening a UPI app, clicking "I've Completed
 * Payment" and returning to the site are all *claims* of payment, not proof of
 * it. Only staff verification or a future provider webhook may settle.
 */

export const PAYMENT_STATUSES = [
  'PENDING',
  'PAYMENT_VERIFICATION_PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'IN_KITCHEN',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * What kind of order this is, and therefore what "paid" unlocks. CAFE walks the
 * kitchen ladder; BOOKS is fulfilled by releasing the download.
 */
export const ORDER_CHANNELS = ['CAFE', 'BOOKS'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

/** Who is asking for the change. CUSTOMER is the restricted one. */
export const ACTOR_TYPES = ['CUSTOMER', 'STAFF', 'SYSTEM', 'PROVIDER'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'PAID',
  'FAILED',
  'CANCELLED',
];

/**
 * A payment can only be reversed by refunding out-of-band, so terminal states
 * are frozen. This is what keeps FAILED/CANCELLED orders from drifting into the
 * paid set.
 */
type Transition = {
  to: PaymentStatus;
  allowedFor: readonly ActorType[];
  /** Requires a bank UTR / provider reference to be recorded. */
  requiresReference?: boolean;
};

const TRANSITIONS: Record<PaymentStatus, readonly Transition[]> = {
  PENDING: [
    { to: 'PAYMENT_VERIFICATION_PENDING', allowedFor: ['CUSTOMER', 'STAFF', 'SYSTEM'] },
    { to: 'PAID', allowedFor: ['STAFF', 'PROVIDER'], requiresReference: true },
    { to: 'FAILED', allowedFor: ['STAFF', 'PROVIDER'] },
    { to: 'CANCELLED', allowedFor: ['CUSTOMER', 'STAFF'] },
  ],
  PAYMENT_VERIFICATION_PENDING: [
    { to: 'PAID', allowedFor: ['STAFF', 'PROVIDER'], requiresReference: true },
    { to: 'FAILED', allowedFor: ['STAFF', 'PROVIDER'] },
    { to: 'CANCELLED', allowedFor: ['STAFF'] },
  ],
  PAID: [],
  FAILED: [],
  CANCELLED: [],
};

export class PaymentTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentTransitionError';
  }
}

export function findTransition(from: PaymentStatus, to: PaymentStatus): Transition | undefined {
  return TRANSITIONS[from].find((t) => t.to === to);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus, actor: ActorType): boolean {
  const transition = findTransition(from, to);
  return transition !== undefined && transition.allowedFor.includes(actor);
}

/** Throws unless `actor` may move a payment from `from` to `to`. */
export function assertTransition(from: PaymentStatus, to: PaymentStatus, actor: ActorType): Transition {
  if (!(PAYMENT_STATUSES as readonly string[]).includes(from) || !(PAYMENT_STATUSES as readonly string[]).includes(to)) {
    throw new PaymentTransitionError('Unknown payment status.');
  }
  const transition = findTransition(from, to);
  if (!transition) {
    throw new PaymentTransitionError(`Payment cannot move from ${from} to ${to}.`);
  }
  if (!transition.allowedFor.includes(actor)) {
    throw new PaymentTransitionError(
      `${actor} is not allowed to confirm a payment as ${to}. Payment confirmation requires staff verification or a provider notification.`,
    );
  }
  return transition;
}

/**
 * Fulfilment side-effect of a settled payment: an awaiting-payment order enters
 * the kitchen only once its payment is PAID. Kept next to the status machine so
 * the rule is impossible to forget when a new provider is added.
 *
 * An ebook order skips the kitchen ladder entirely — settlement releases the
 * download instead, so it lands on COMPLETED.
 */
export function orderStatusForPaymentStatus(
  current: OrderStatus,
  payment: PaymentStatus,
  channel: OrderChannel = 'CAFE',
): OrderStatus {
  if (payment === 'PAID') {
    if (current !== 'AWAITING_PAYMENT') return current;
    return channel === 'BOOKS' ? 'COMPLETED' : 'IN_KITCHEN';
  }
  // A cancelled payment only cancels an order that has not started preparation.
  // In practice the state machine makes this the only case reachable, since a
  // PAID payment is terminal and therefore can never turn CANCELLED later.
  if (payment === 'CANCELLED' && current === 'AWAITING_PAYMENT') return 'CANCELLED';
  return current;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Not paid yet',
  PAYMENT_VERIFICATION_PENDING: 'Verification pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

/**
 * Copy shown to the customer for each state. Deliberately avoids the word
 * "successful" for anything the customer self-reported.
 */
export const PAYMENT_STATUS_CUSTOMER_COPY: Record<PaymentStatus, string> = {
  PENDING: 'Scan the QR code or open a UPI app to pay.',
  PAYMENT_VERIFICATION_PENDING:
    'Payment verification pending. The business will confirm your payment.',
  PAID: 'Payment confirmed. Your order is being prepared.',
  FAILED: 'This payment could not be verified. Please contact the business.',
  CANCELLED: 'This order was cancelled.',
};

/** Only the settled line differs by channel; nothing else rewords itself. */
export function customerCopyFor(status: PaymentStatus, channel: OrderChannel = 'CAFE'): string {
  if (status === 'PAID' && channel === 'BOOKS') {
    return 'Payment confirmed. Your download is ready below.';
  }
  return PAYMENT_STATUS_CUSTOMER_COPY[status];
}
