'use server';

import { redirect } from 'next/navigation';
import { authenticate, startSession, endSession } from '@/lib/auth/session';
import type { StaffFormState } from '@/lib/actions/staff';

export async function loginAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');

  const user = await authenticate(email, password);
  if (!user) {
    // One generic message: do not reveal whether the address exists.
    return { ok: false, message: 'Those credentials did not match.' };
  }

  await startSession(user);
  // The page the staffer was pushed away from, if it is a path on this site.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/login');
}
