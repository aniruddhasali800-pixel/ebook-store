'use client';

import { useActionState } from 'react';
import { savePaymentSettingsAction, type StaffFormState } from '@/lib/actions/staff';
import type { PaymentSettingsView } from '@/lib/settings';

const initialState: StaffFormState = undefined;

export function PaymentSettings({
  settings,
  canEdit,
}: {
  settings: PaymentSettingsView;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePaymentSettingsAction, initialState);

  return (
    <form
      action={formAction}
      className="max-w-xl space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-900">UPI payout details</h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500">
          Order QR codes pay this account directly — no gateway in the middle, so UPI money arrives
          as an ordinary transfer you check yourself. Card payments are separate: they settle to
          the merchant bank account through the gateway, never as a transfer to this UPI ID.
        </p>
      </div>

      {settings.configured ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Currently saved: <span className="font-medium text-zinc-900">{settings.maskedVpa}</span>
          <span className="text-zinc-400"> (stored encrypted; the full UPI ID is never displayed again)</span>
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          No UPI ID saved yet. Customers cannot place orders until one is set.
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Business name</span>
        <input
          name="businessName"
          required
          maxLength={80}
          defaultValue={settings.businessName}
          disabled={!canEdit}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-500"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">UPI ID (payee VPA)</span>
        <input
          name="upiId"
          required
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder="businessname@bank"
          disabled={!canEdit}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-500"
        />
        <span className="mt-1.5 block text-xs text-zinc-500">
          Re-enter it on every save — a payee change should never be a side effect of editing
          something else.
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-zinc-700">UPI display name (optional)</span>
        <input
          name="upiPayeeName"
          maxLength={50}
          defaultValue={settings.payeeName}
          disabled={!canEdit}
          placeholder="Shown inside the customer's UPI app"
          className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-500"
        />
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-3 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={settings.enabled}
          disabled={!canEdit}
          className="mt-0.5 size-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/20"
        />
        <span>
          <span className="block font-medium text-zinc-800">Enable UPI payments</span>
          <span className="block text-xs text-zinc-500">
            Turning this off hides the pay button and blocks new orders; existing pending orders
            stay verifiable.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !canEdit}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {state?.message ? (
          <p
            role="status"
            className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="text-xs text-zinc-500">
          Your role can verify payments but not change payout details. Ask an admin.
        </p>
      ) : null}
    </form>
  );
}
