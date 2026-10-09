'use server';

import { revalidatePath } from 'next/cache';
import { extendSession, requireAdmin, requireStaff } from '@/lib/auth/session';
import { savePaymentSettings, PaymentSettingsError } from '@/lib/settings';
import { advanceOrderStatus, transitionPayment, PaymentServiceError } from '@/lib/payments/service';
import type { OrderStatus, PaymentStatus } from '@/lib/payments/status';

export type StaffFormState = { ok: boolean; message?: string } | undefined;

/** Staff decision values only; PAID requires a bank reference. */
const DECISIONS: Record<string, PaymentStatus> = {
  paid: 'PAID',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

export async function verifyPaymentAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }
  await extendSession(staff);

  const orderId = String(formData.get('orderId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const to = DECISIONS[decision];
  const reference = String(formData.get('reference') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();

  if (!orderId || !to) {
    return { ok: false, message: 'Choose an outcome for this payment.' };
  }

  try {
    await transitionPayment({
      orderId,
      to,
      actor: 'STAFF',
      actorId: staff.id,
      reference: reference || undefined,
      reason: reason || undefined,
    });
  } catch (error) {
    if (error instanceof PaymentServiceError) return { ok: false, message: error.message };
    if (error && typeof error === 'object' && 'name' in error && (error as Error).name === 'PaymentTransitionError') {
      return { ok: false, message: (error as Error).message };
    }
    console.error('Payment verification failed', error);
    return { ok: false, message: 'Could not update this payment. Please try again.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/kitchen');
  return {
    ok: true,
    message:
      to === 'PAID'
        ? 'Marked paid. The order has been sent to the kitchen.'
        : `Payment marked ${to.toLowerCase()}.`,
  };
}

export async function savePaymentSettingsAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, message: 'Only an admin can change payment settings.' };
  }
  await extendSession(admin);

  try {
    await savePaymentSettings(
      {
        businessName: String(formData.get('businessName') ?? ''),
        // The stored UPI ID is encrypted and never shown in full, so saving always
        // requires re-entering it. That makes a payee change a deliberate act.
        upiId: String(formData.get('upiId') ?? ''),
        upiPayeeName: String(formData.get('upiPayeeName') ?? ''),
        enabled: formData.get('enabled') === 'on',
      },
      admin.id,
    );
  } catch (error) {
    if (error instanceof PaymentSettingsError) return { ok: false, message: error.message };
    console.error('Settings save failed', error);
    return { ok: false, message: 'Could not save payment settings.' };
  }

  revalidatePath('/admin/settings');
  revalidatePath('/');
  return { ok: true, message: 'Payment settings saved.' };
}

/** Plain form action (no useActionState): receives FormData directly. */
export async function advanceOrderStatusAction(formData: FormData): Promise<void> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return;
  }
  await extendSession(staff);

  const orderId = String(formData.get('orderId') ?? '');
  const next = String(formData.get('next') ?? '') as OrderStatus;
  if (!orderId || !next) return;

  try {
    await advanceOrderStatus(orderId, next);
  } catch (error) {
    // A rejected transition leaves the board as it was; nothing to render here.
    console.warn('Order status update rejected', error instanceof Error ? error.message : error);
  }

  revalidatePath('/admin/kitchen');
}
