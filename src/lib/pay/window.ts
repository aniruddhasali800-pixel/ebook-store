/**
 * The shop's own time limit on a payment request.
 *
 * A `upi://pay` QR carries no expiry — the code stays scannable indefinitely — so
 * this window is not something a UPI app enforces for us. It exists so a customer
 * who walks away from the screen does not come back an hour later to a page that
 * still reads like a live bill, and so the staff are warned that a claim on an
 * old order needs a careful look at the statement.
 *
 * Nothing here cancels an order. A transfer that arrives after the window is
 * still real money, and only staff verification can settle it, so the page says
 * the request has passed its time and leaves both choices to the customer.
 */
export const PAY_WINDOW_MINUTES = 5;

export type PayWindow = {
  closesAt: Date;
  /** Never negative, so a countdown cannot render "-3s". */
  remainingMs: number;
  /** True while the request is still inside the window. */
  open: boolean;
};

/** Half a second of slack: a clock skew must not show a negative countdown. */
export function payWindowClosesAt(createdAt: Date, minutes = PAY_WINDOW_MINUTES): Date {
  return new Date(createdAt.getTime() + minutes * 60_000);
}

export function payWindowAt(createdAt: Date, now: Date): PayWindow {
  const closesAt = payWindowClosesAt(createdAt);
  const remainingMs = Math.max(0, closesAt.getTime() - now.getTime());
  return { closesAt, remainingMs, open: remainingMs > 0 };
}

/** `4:12`, or `0:07` when there is under a minute left. */
export function formatPayWindow(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
