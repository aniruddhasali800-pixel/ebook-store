import 'server-only';
import { prisma } from '@/lib/db';
import { publishActivity } from '@/lib/activity';
import { forSale, fromCount, restock, stockState, writeOff, type StockChange, type StockKind } from './ledger';

/**
 * The shelf, as the database sees it.
 *
 * Only one thing may take units off a stock row without a human typing a number:
 * an order that has been marked PAID. Everything else — a claim, an order still
 * awaiting payment, a cancelled one — leaves the ledger alone, because direct UPI
 * gives this shop no proof a transfer happened until somebody reads it off the
 * statement. That is the same rule the payment ladder follows, so stock and money
 * cannot disagree.
 */

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

export type StockRow = {
  id: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  parLevel: number;
  menuItemId: string | null;
  menuItemName: string | null;
  state: 'LOW' | 'OK' | 'UNSET';
};

export type SaleConsumption = {
  name: string;
  deltaUnits: number;
  shortByUnits: number;
  nowLow: boolean;
};

function toRow(item: {
  id: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  parLevel: number;
  menuItemId: string | null;
  menuItem: { name: string } | null;
}): StockRow {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantityOnHand: item.quantityOnHand,
    parLevel: item.parLevel,
    menuItemId: item.menuItemId,
    menuItemName: item.menuItem?.name ?? null,
    state: stockState(item),
  };
}

/**
 * Depletes the shelf for an order that has just become PAID.
 *
 * Called only from the payment service on the transition into PAID, and that
 * transition is a compare-and-swap, so a double-click on "mark paid" cannot take
 * the units twice. A shortfall is recorded and reported rather than thrown,
 * because the money has already arrived and refusing the settlement would be a
 * worse lie than admitting the count was wrong.
 */
export async function consumeStockForPaidOrder(
  order: { id: string; orderId: string },
  actorId: string | null,
): Promise<SaleConsumption[]> {
  const lines = await prisma.orderItem.findMany({
    where: { orderId: order.id, menuItemId: { not: null } },
    select: { menuItemId: true, quantity: true },
  });
  const tracked = lines.filter((line): line is { menuItemId: string; quantity: number } => Boolean(line.menuItemId));
  if (tracked.length === 0) return [];

  // Two lines for the same till item must drain one shelf row once, not twice.
  const wantedByMenuItem = new Map<string, number>();
  for (const line of tracked) {
    wantedByMenuItem.set(line.menuItemId, (wantedByMenuItem.get(line.menuItemId) ?? 0) + line.quantity);
  }

  const items = await prisma.stockItem.findMany({
    where: { menuItemId: { in: [...wantedByMenuItem.keys()] } },
  });
  if (items.length === 0) return [];

  const applied: SaleConsumption[] = [];
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const wanted = wantedByMenuItem.get(item.menuItemId ?? '') ?? 0;
      let change: StockChange;
      try {
        change = forSale(item.quantityOnHand, wanted);
      } catch (error) {
        // A malformed line should never be able to block a settled payment.
        console.error('Stock line rejected', item.name, error instanceof Error ? error.message : error);
        continue;
      }
      await tx.stockItem.update({
        where: { id: item.id },
        data: { quantityOnHand: change.balanceAfter },
      });
      await tx.stockMovement.create({
        data: {
          stockItemId: item.id,
          kind: 'SALE',
          deltaUnits: change.deltaUnits,
          balanceAfter: change.balanceAfter,
          orderId: order.id,
          actorId,
          shortByUnits: change.shortByUnits,
          note: change.shortByUnits > 0 ? `Order #${order.orderId} asked for ${wanted}` : null,
        },
      });
      applied.push({
        name: item.name,
        deltaUnits: change.deltaUnits,
        shortByUnits: change.shortByUnits,
        nowLow: stockState({ quantityOnHand: change.balanceAfter, parLevel: item.parLevel }) === 'LOW',
      });
    }
  });

  // The admin sees this without having to open the page: a shortfall means a
  // paying customer was served something the shop had not counted.
  const short = applied.filter((row) => row.shortByUnits > 0);
  if (short.length > 0) {
    await publishActivity({
      type: 'stock',
      channel: 'CAFE',
      headline: `Order #${order.orderId} oversold ${short.map((row) => row.name).join(', ')}`,
      detail: `${short.reduce((sum, row) => sum + row.shortByUnits, 0)} units were not on the shelf — the count needs a look`,
      href: '/admin/inventory',
    });
  }
  const low = applied.filter((row) => row.shortByUnits === 0 && row.nowLow);
  if (low.length > 0) {
    await publishActivity({
      type: 'stock',
      channel: 'CAFE',
      headline: `${low.map((row) => row.name).join(', ')} reached its par level`,
      detail: 'Reorder, or count the shelf if you think the number is wrong.',
      href: '/admin/inventory',
    });
  }

  return applied;
}

export async function listStock(): Promise<StockRow[]> {
  const items = await prisma.stockItem.findMany({
    include: { menuItem: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  return items.map(toRow);
}

export async function findStockItem(id: string) {
  return prisma.stockItem.findUnique({
    where: { id },
    include: { menuItem: { select: { name: true } } },
  });
}

export type MovementRow = {
  id: string;
  kind: StockKind | string;
  deltaUnits: number;
  balanceAfter: number;
  shortByUnits: number;
  stockItemName: string;
  orderCode: string | null;
  actorName: string | null;
  note: string | null;
  at: Date;
};

export async function recentMovements(limit = 30): Promise<MovementRow[]> {
  const rows = await prisma.stockMovement.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      stockItem: { select: { name: true } },
      order: { select: { orderId: true } },
      actor: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    deltaUnits: row.deltaUnits,
    balanceAfter: row.balanceAfter,
    shortByUnits: row.shortByUnits,
    stockItemName: row.stockItem.name,
    orderCode: row.order?.orderId ?? null,
    actorName: row.actor?.name ?? null,
    note: row.note,
    at: row.createdAt,
  }));
}

/**
 * A human's number replaces the ledger's. Used both for a routine count and for
 * fixing a figure that drifted — the difference is recorded either way, so the
 * audit trail shows a correction for what it is.
 */
export async function recordCount(input: {
  stockItemId: string;
  counted: number;
  note?: string;
  actorId: string;
}): Promise<StockRow> {
  const item = await findStockItem(input.stockItemId);
  if (!item) throw new InventoryError('That stock item no longer exists.');

  let change: StockChange;
  try {
    change = fromCount(item.quantityOnHand, input.counted);
  } catch {
    throw new InventoryError('Enter a whole number of units, zero or more.');
  }

  await prisma.$transaction([
    prisma.stockItem.update({ where: { id: item.id }, data: { quantityOnHand: change.balanceAfter } }),
    prisma.stockMovement.create({
      data: {
        stockItemId: item.id,
        kind: 'COUNT',
        deltaUnits: change.deltaUnits,
        balanceAfter: change.balanceAfter,
        actorId: input.actorId,
        note: input.note?.trim().slice(0, 200) || (change.deltaUnits === 0 ? 'Counted, matched the ledger' : null),
      },
    }),
  ]);

  const fresh = await findStockItem(item.id);
  return toRow(fresh ?? item);
}

/** Units in (+) or out (−) without a sale: a delivery, spoilage, staff use. */
export async function recordAdjustment(input: {
  stockItemId: string;
  kind: 'RESTOCK' | 'WRITE_OFF';
  units: number;
  note?: string;
  actorId: string;
}): Promise<StockRow> {
  const item = await findStockItem(input.stockItemId);
  if (!item) throw new InventoryError('That stock item no longer exists.');
  if (!(input.note ?? '').trim()) {
    throw new InventoryError(
      input.kind === 'RESTOCK'
        ? 'Say where the units came from — a delivery note, a supplier, a number.'
        : 'Say what happened to them: burnt, dropped, given away. A write-off with no reason is a hole in the ledger.',
    );
  }

  let change: StockChange;
  try {
    change = input.kind === 'RESTOCK' ? restock(item.quantityOnHand, input.units) : writeOff(item.quantityOnHand, input.units);
  } catch {
    throw new InventoryError('Enter a whole number of units between 1 and 9999.');
  }

  await prisma.$transaction([
    prisma.stockItem.update({ where: { id: item.id }, data: { quantityOnHand: change.balanceAfter } }),
    prisma.stockMovement.create({
      data: {
        stockItemId: item.id,
        kind: input.kind,
        deltaUnits: change.deltaUnits,
        balanceAfter: change.balanceAfter,
        actorId: input.actorId,
        shortByUnits: change.shortByUnits,
        note: input.note!.trim().slice(0, 200),
      },
    }),
  ]);

  // The row we loaded is stale the moment the write lands, so the caller gets the
  // fresh figure rather than a state computed before it.
  const fresh = await findStockItem(item.id);
  return toRow(fresh ?? item);
}

export async function setParLevel(input: { stockItemId: string; parLevel: number }): Promise<void> {
  if (!Number.isInteger(input.parLevel) || input.parLevel < 0 || input.parLevel > 9999) {
    throw new InventoryError('A par level must be a whole number of units, or 0 for no warning.');
  }
  const updated = await prisma.stockItem.updateMany({
    where: { id: input.stockItemId },
    data: { parLevel: input.parLevel },
  });
  if (updated.count !== 1) throw new InventoryError('That stock item no longer exists.');
}

/**
 * Starts a tracked item. The opening figure is written as a COUNT so the first
 * movement in the ledger is the moment the shop started watching the shelf.
 */
export async function createStockItem(input: {
  name: string;
  unit: string;
  menuItemId?: string | null;
  openingCount: number;
  parLevel: number;
  actorId: string;
}): Promise<{ id: string; created: boolean }> {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (name.length < 2) throw new InventoryError('Give the stock a name long enough to recognise on a shelf label.');
  const unit = input.unit.trim().replace(/\s+/g, ' ').slice(0, 20) || 'units';
  if (!Number.isInteger(input.openingCount) || input.openingCount < 0 || input.openingCount > 999_999) {
    throw new InventoryError('Enter the opening count as a whole number of units, zero or more.');
  }
  if (!Number.isInteger(input.parLevel) || input.parLevel < 0 || input.parLevel > 9999) {
    throw new InventoryError('A par level must be a whole number of units, or 0 for no warning.');
  }
  if (input.menuItemId) {
    const menu = await prisma.menuItem.findUnique({ where: { id: input.menuItemId }, select: { id: true } });
    if (!menu) throw new InventoryError('That menu item is not on the till list.');
    const taken = await prisma.stockItem.findUnique({ where: { menuItemId: input.menuItemId }, select: { id: true, name: true } });
    if (taken) {
      throw new InventoryError(`${taken.name} already tracks that menu item. One till item can only drain one shelf row.`);
    }
  }

  const existing = await prisma.stockItem.findUnique({ where: { name }, select: { id: true } });
  if (existing) throw new InventoryError(`A stock row called ${name} already exists. Count it instead of adding a second one.`);

  const created = await prisma.stockItem.create({
    data: {
      name,
      unit,
      quantityOnHand: input.openingCount,
      parLevel: input.parLevel,
      menuItemId: input.menuItemId || null,
      movements: {
        create: {
          kind: 'COUNT',
          deltaUnits: input.openingCount,
          balanceAfter: input.openingCount,
          actorId: input.actorId,
          note: 'Opening count',
        },
      },
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

/**
 * Until a download file is attached, a title cannot be delivered. Sold copies of
 * it are listed here so nobody discovers that after taking money.
 */
export type BookLedgerRow = {
  id: string;
  title: string;
  published: boolean;
  copiesSold: number;
  hasFile: boolean;
  filePath: string | null;
};

export async function booksSoldLedger(): Promise<BookLedgerRow[]> {
  const [books, sold] = await Promise.all([
    prisma.book.findMany({
      select: { id: true, title: true, published: true, filePath: true },
      orderBy: [{ published: 'desc' }, { title: 'asc' }],
    }),
    prisma.orderItem.groupBy({
      by: ['bookId'],
      where: { bookId: { not: null }, order: { paymentStatus: 'PAID' } },
      _sum: { quantity: true },
    }),
  ]);
  const copiesById = new Map(
    sold.map((row) => [row.bookId as string, row._sum.quantity ?? 0]),
  );
  return books.map((book) => ({
    id: book.id,
    title: book.title,
    published: book.published,
    copiesSold: copiesById.get(book.id) ?? 0,
    hasFile: Boolean(book.filePath),
    filePath: book.filePath,
  }));
}

/** Tracked vs untracked till items, so the add form can only offer real choices. */
export async function menuItemsForStock() {
  const [items, tracked] = await Promise.all([
    prisma.menuItem.findMany({
      where: { available: true },
      select: { id: true, name: true, category: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.stockItem.findMany({ select: { menuItemId: true }, where: { menuItemId: { not: null } } }),
  ]);
  const taken = new Set(tracked.map((row) => row.menuItemId));
  return items.map((item) => ({ ...item, tracked: taken.has(item.id) }));
}

/** Counts the page header leads with. */
export async function stockTotals() {
  const rows = await listStock();
  return {
    tracked: rows.length,
    low: rows.filter((row) => row.state === 'LOW').length,
    untrackedPar: rows.filter((row) => row.state === 'UNSET').length,
  };
}
