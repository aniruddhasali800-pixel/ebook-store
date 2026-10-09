import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { signSession, verifySession, verifyPassword, type SessionPayload } from '@/lib/crypto';

export const SESSION_COOKIE = 'upi_session';
/**
 * Five minutes, renewed by every staff action. A counter screen left unattended
 * stops working shortly after the staffer walks away, while somebody actually
 * working is never bounced mid-task — the clock measures idleness, not the
 * calendar.
 */
export const SESSION_TTL_SECONDS = 5 * 60;

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CASHIER';
};

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

function freshSession(user: StaffUser): { value: string; options: ReturnType<typeof sessionCookieOptions> } {
  return {
    value: signSession({
      userId: user.id,
      role: user.role,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
    options: sessionCookieOptions(),
  };
}

export async function startSession(user: StaffUser): Promise<void> {
  const store = await cookies();
  const session = freshSession(user);
  store.set(SESSION_COOKIE, session.value, session.options);
}

/**
 * Renew a session after a staff action so a five-minute clock never interrupts
 * work in progress.
 *
 * This is only legal inside a Server Function or a Route Handler: HTTP cannot
 * attach a `Set-Cookie` once a page has started streaming, so no page render may
 * call it and the queue-reading staff who do nothing for five minutes will be
 * asked to sign in again — which is the point of the window.
 */
export async function extendSession(user: StaffUser): Promise<void> {
  const store = await cookies();
  const session = freshSession(user);
  store.set(SESSION_COOKIE, session.value, session.options);
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * The cookie is only an optimistic claim. Every staff action resolves it against
 * the user row, so a deleted or demoted account loses access immediately rather
 * than at token expiry.
 */
export async function requireStaff(): Promise<StaffUser> {
  const payload = await getSessionPayload();
  if (!payload) throw new Error('UNAUTHENTICATED');
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new Error('UNAUTHENTICATED');
  if (user.role !== 'ADMIN' && user.role !== 'CASHIER') throw new Error('FORBIDDEN');
  return user as StaffUser;
}

export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}

export async function authenticate(email: string, password: string): Promise<StaffUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, role: true, passwordHash: true },
  });
  if (!user) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  if (user.role !== 'ADMIN' && user.role !== 'CASHIER') return null;

  // Build the shape explicitly so the password hash has no path to a session.
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
