'use server';

import { revalidatePath } from 'next/cache';
import { extendSession, requireAdmin } from '@/lib/auth/session';
import {
  InventoryError,
  createStockItem,
  recordAdjustment,
  recordCount,
  setParLevel,
} from '@/lib/inventory/stock';
import type { StaffFormState } from './staff';

/**
 * Every handler here is admin-only, and every one checks that itself.
 *
 * The page is gated too, but a gate on a page only ever hides a form — it does not
 * protect the route behind it. A cashier who posts to these actions directly gets
 * the same refusal a cashier gets on payment settings.
 */

const DENIED: StaffFormState = { ok: false, message: 'Only an admin can change stock records.' };

async function adminOrDenied() {
  try {
    const admin = await requireAdmin();
    await extendSession(admin);
    return admin;
  } catch {
    return null;
  }
}

/** Turns a thrown validation error into the sentence the admin should read. */
function failure(error: unknown): StaffFormState {
  if (error instanceof InventoryError) return { ok: false, message: error.message };
  console.error('Stock update failed', error);
  return { ok: false, message: 'Could not save that. Nothing was changed — try again.' };
}

function wholeNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function createStockItemAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const admin = await adminOrDenied();
  if (!admin) return DENIED;

  try {
    const item = await createStockItem({
      name: String(formData.get('name') ?? ''),
      unit: String(formData.get('unit') ?? ''),
      menuItemId: String(formData.get('menuItemId') ?? '') || null,
      openingCount: wholeNumber(formData.get('openingCount')) ?? -1,
      parLevel: wholeNumber(formData.get('parLevel')) ?? -1,
      actorId: admin.id,
    });
    revalidatePath('/admin/inventory');
    revalidatePath('/admin');
    return {
      ok: true,
      message: item.created
        ? 'Stock item added. Settled orders will now deplete it.'
        : 'Saved.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function recordCountAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const admin = await adminOrDenied();
  if (!admin) return DENIED;

  try {
    const row = await recordCount({
      stockItemId: String(formData.get('stockItemId') ?? ''),
      counted: wholeNumber(formData.get('counted')) ?? -1,
      note: String(formData.get('note') ?? ''),
      actorId: admin.id,
    });
    revalidatePath('/admin/inventory');
    return {
      ok: true,
      message: `Counted. ${row.name} now reads ${row.quantityOnHand} ${row.unit}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function recordRestockAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  return adjustment(formData, 'RESTOCK', 'Added');
}

export async function recordWriteOffAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  return adjustment(formData, 'WRITE_OFF', 'Written off');
}

async function adjustment(
  formData: FormData,
  kind: 'RESTOCK' | 'WRITE_OFF',
  verb: string,
): Promise<StaffFormState> {
  const admin = await adminOrDenied();
  if (!admin) return DENIED;

  const units = wholeNumber(formData.get('units')) ?? -1;
  try {
    const row = await recordAdjustment({
      stockItemId: String(formData.get('stockItemId') ?? ''),
      kind,
      units,
      note: String(formData.get('note') ?? ''),
      actorId: admin.id,
    });
    revalidatePath('/admin/inventory');
    return {
      ok: true,
      message: `${verb} ${units} ${row.unit} of ${row.name}. Shelf now ${row.quantityOnHand}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

/** A par level is a threshold, not a movement, so it never touches the ledger. */
export async function setParLevelAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const admin = await adminOrDenied();
  if (!admin) return DENIED;

  const parLevel = wholeNumber(formData.get('parLevel')) ?? -1;
  try {
    await setParLevel({ stockItemId: String(formData.get('stockItemId') ?? ''), parLevel });
    revalidatePath('/admin/inventory');
    return {
      ok: true,
      message: parLevel === 0 ? 'Par level cleared — this item will not be flagged.' : `Will be flagged at or below ${parLevel}.`,
    };
  } catch (error) {
    return failure(error);
  }
}
