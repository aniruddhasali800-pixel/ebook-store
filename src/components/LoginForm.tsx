'use client';

import { useActionState } from 'react';
import { loginAction } from '@/lib/actions/auth';
import { logoutAction } from '@/lib/actions/auth';
import type { StaffFormState } from '@/lib/actions/staff';

const initialState: StaffFormState = undefined;

export function LoginForm({ next = '/admin' }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form
      action={formAction}
      className="max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200"
    >
      <input type="hidden" name="next" value={next} />
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Staff sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cashiers verify payments; admins also manage payout settings. A sign-in is
          dropped after five minutes without a staff action, so an unattended counter
          screen stops working on its own.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      {state && !state.ok ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Sign out
      </button>
    </form>
  );
}
