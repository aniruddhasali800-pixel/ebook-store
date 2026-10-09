import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { getSessionPayload } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff sign in' };

/** Only ever an in-app path, so a signed-in redirect cannot leave the site. */
function safeTarget(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getSessionPayload()) redirect(safeTarget(next));

  return (
    <div className="flex justify-center py-6">
      <LoginForm next={safeTarget(next)} />
    </div>
  );
}
