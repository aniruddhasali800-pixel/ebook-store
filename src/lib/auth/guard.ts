import 'server-only';
import { redirect } from 'next/navigation';
import { requireStaff, type StaffUser } from '@/lib/auth/session';

/**
 * The page-side staff guard.
 *
 * A layout that checks the cookie is only the first line — a page reached from a
 * stale cache segment or a direct URL must still resolve the session against the
 * user row. This is that check, with the redirect the layout would have done.
 */
export async function staffOrSignIn(next: string): Promise<StaffUser> {
  try {
    return await requireStaff();
  } catch {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
}
