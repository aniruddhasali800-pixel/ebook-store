import { paiseToRupeesString } from '@/lib/money';

/**
 * UPI deep-link / QR payload builder (NPCI "upi" URI scheme).
 *
 * Both the scanned QR and the mobile "Open UPI App" button must produce the
 * *same* payload, so this is the only place that assembles it.
 */

export const UPI_SCHEME = 'upi://pay';

/** NPCI-style VPA: local-part@handle */
const VPA_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z]{2,64}$/;

const LIMITS = {
  payeeName: 50,
  transactionRef: 35,
  noteText: 80,
  merchantCode: 12,
} as const;

export class UpiUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpiUriError';
  }
}

export function isValidVpa(vpa: string): boolean {
  return VPA_PATTERN.test(vpa.trim());
}

/**
 * Drops control characters and caps length. Punctuation is kept — including
 * "&", "=" and "#" — because every value is percent-encoded below, and a payee
 * name like "Sharma & Sons" should not be mangled.
 */
function sanitizeText(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export type UpiPaymentParams = {
  payeeVpa: string;
  payeeName: string;
  amountInPaise: number;
  transactionRef: string;
  noteText?: string;
  merchantCode?: string;
  currency?: 'INR';
};

export type BuiltUpiUri = {
  uri: string;
  /** Decoded values, for rendering/debugging without re-parsing the URI. */
  params: {
    pa: string;
    pn: string;
    am: string;
    cu: 'INR';
    tr: string;
    tn?: string;
    mc?: string;
  };
};

export function buildUpiUri(params: UpiPaymentParams): BuiltUpiUri {
  const pa = params.payeeVpa.trim();
  if (!isValidVpa(pa)) {
    throw new UpiUriError('Enter a valid UPI ID, for example businessname@bank.');
  }

  const amount = params.amountInPaise;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new UpiUriError('Order amount must be greater than zero.');
  }

  const transactionRef = sanitizeText(params.transactionRef, LIMITS.transactionRef)
    .replace(/[^a-zA-Z0-9-]/g, '');
  if (!transactionRef) {
    throw new UpiUriError('A transaction reference is required.');
  }

  const built: BuiltUpiUri['params'] = {
    pa,
    pn: sanitizeText(params.payeeName || pa, LIMITS.payeeName),
    // Exact 2-decimal amount, never group-separated.
    am: paiseToRupeesString(amount),
    cu: 'INR',
    tr: transactionRef,
  };

  if (params.noteText) {
    built.tn = sanitizeText(params.noteText, LIMITS.noteText);
  }
  if (params.merchantCode) {
    built.mc = sanitizeText(params.merchantCode, LIMITS.merchantCode).replace(/[^0-9]/g, '');
  }

  const query = Object.entries(built)
    .filter(([, value]) => value !== undefined && value !== '')
    // Ordered deterministically so the same order always renders the same QR.
    .sort(([a], [b]) => keyOrder(a) - keyOrder(b))
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');

  return { uri: `${UPI_SCHEME}?${query}`, params: built };
}

const KEY_ORDER = ['pa', 'pn', 'mc', 'am', 'cu', 'tn', 'tr'];
function keyOrder(key: string): number {
  const index = KEY_ORDER.indexOf(key);
  return index === -1 ? KEY_ORDER.length : index;
}

/** Inverse of buildUpiUri; used by tests to assert what a scanner would read. */
export function parseUpiUri(uri: string): BuiltUpiUri['params'] {
  if (!uri.startsWith(`${UPI_SCHEME}?`)) {
    throw new UpiUriError(`Not a UPI payment URI: ${uri.slice(0, 24)}`);
  }
  const query = new URLSearchParams(uri.slice(UPI_SCHEME.length + 1));
  const get = (key: string) => {
    const raw = query.get(key);
    return raw === null ? undefined : raw;
  };
  const pa = get('pa');
  if (!pa) throw new UpiUriError('UPI URI is missing the payee VPA (pa).');
  return {
    pa,
    pn: get('pn') ?? pa,
    am: get('am') ?? '',
    cu: (get('cu') ?? 'INR') as 'INR',
    tr: get('tr') ?? '',
    tn: get('tn'),
    mc: get('mc'),
  };
}
