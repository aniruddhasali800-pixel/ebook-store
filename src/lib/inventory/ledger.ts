/**
 * The arithmetic of a stock count, kept free of the database and of Next so the
 * rules a shelf follows can be read, and tested, on their own.
 *
 * Two decisions in here are deliberate:
 *
 * - A count never goes below zero. Money the shop has already received is real,
 *   so a settled order is never refused because the ledger says the shelf is
 *   empty. The sale is applied as far as the units allow and the missing units
 *   are written down as a shortfall instead of vanishing.
 * - A movement stores the change it made, not the number it ended on, so the
 *   running balance can be rebuilt from the ledger alone.
 */

export type StockKind = 'SALE' | 'COUNT' | 'RESTOCK' | 'WRITE_OFF';

export const STOCK_KINDS: readonly StockKind[] = ['SALE', 'COUNT', 'RESTOCK', 'WRITE_OFF'];

export type StockChange = {
  deltaUnits: number;
  balanceAfter: number;
  /** Units asked for that were not on the shelf. Only a SALE can carry one. */
  shortByUnits: number;
};

function asOnHand(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`On-hand units must be a non-negative integer, got ${value}`);
  }
  return value;
}

function asRequested(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 9999) {
    throw new TypeError(`${label} must be a whole number between 1 and 9999, got ${value}`);
  }
  return value;
}

/**
 * What a settled order takes off the shelf. `requested` is the quantity on the
 * order line; anything the shelf could not give comes back as a shortfall.
 */
export function forSale(onHand: number, requested: number): StockChange {
  const available = asOnHand(onHand);
  const wanted = asRequested(requested, 'Ordered units');
  const taken = Math.min(available, wanted);
  return {
    // Negating zero yields negative zero, which prints and stores as a number no
    // ledger row should ever claim to be.
    deltaUnits: taken === 0 ? 0 : -taken,
    balanceAfter: available - taken,
    shortByUnits: wanted - taken,
  };
}

/**
 * A physical count replaces the figure on the page. The movement records the
 * difference, so "the bag says 9, the ledger said 12" stays visible.
 */
export function fromCount(onHand: number, counted: number): StockChange {
  const available = asOnHand(onHand);
  if (!Number.isInteger(counted) || counted < 0 || counted > 999_999) {
    throw new TypeError(`A counted figure must be a whole number of units, got ${counted}`);
  }
  return {
    deltaUnits: counted - available,
    balanceAfter: counted,
    shortByUnits: 0,
  };
}

/** Units arriving: a delivery, or stock put back after a cancelled order. */
export function restock(onHand: number, units: number): StockChange {
  const available = asOnHand(onHand);
  const added = asRequested(units, 'Delivered units');
  return { deltaUnits: added, balanceAfter: available + added, shortByUnits: 0 };
}

/** Units leaving without being sold: spoilage, breakage, staff meals. */
export function writeOff(onHand: number, units: number): StockChange {
  const available = asOnHand(onHand);
  const lost = asRequested(units, 'Written-off units');
  const taken = Math.min(available, lost);
  return {
    deltaUnits: taken === 0 ? 0 : -taken,
    balanceAfter: available - taken,
    shortByUnits: lost - taken,
  };
}

/**
 * Whether the page should flag an item. A par level of zero means the admin has
 * not set one, which is shown as "no level set" rather than as permanently low —
 * an unset threshold must not shout on every row.
 */
export function stockState(item: { quantityOnHand: number; parLevel: number }): 'LOW' | 'OK' | 'UNSET' {
  if (item.parLevel <= 0) return 'UNSET';
  return item.quantityOnHand <= item.parLevel ? 'LOW' : 'OK';
}

/** Sum of what settled orders asked for that the shelf did not have. */
export function totalShortfall(movements: readonly { shortByUnits: number }[]): number {
  return movements.reduce((total, movement) => total + movement.shortByUnits, 0);
}
