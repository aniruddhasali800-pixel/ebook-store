/**
 * Money is stored and computed as integer paise (1 INR = 100 paise) everywhere.
 * Floats only ever appear at the formatting edge, which is what keeps the UPI
 * `am=` amount exact.
 */

export function paiseToRupeesString(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`Expected integer paise, got ${paise}`);
  }
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(paise: number): string {
  return `₹${inr.format(paise / 100)}`;
}

export function sumLineTotals(
  items: readonly { unitPriceInPaise: number; quantity: number }[],
): number {
  return items.reduce((total, item) => total + lineTotal(item), 0);
}

export function lineTotal(item: { unitPriceInPaise: number; quantity: number }): number {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new TypeError(`Quantity must be a positive integer, got ${item.quantity}`);
  }
  if (!Number.isInteger(item.unitPriceInPaise) || item.unitPriceInPaise < 0) {
    throw new TypeError(`Unit price must be non-negative integer paise, got ${item.unitPriceInPaise}`);
  }
  return item.unitPriceInPaise * item.quantity;
}

/**
 * Parses a rupee amount typed by a human ("399", "399.50", "1,299.00") into
 * integer paise. Returns null rather than rounding a half-paise into existence.
 */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '').replace(/^₹\s*/, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, fraction = ''] = cleaned.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}
