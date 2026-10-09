'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The customer's half of the simulated gateway.
 *
 * A real hosted checkout looks like this page — its own domain, its own form,
 * the shop's site only ever seeing the result — except the card fields live on
 * the gateway and the money moves through its acquirer. Here there are no card
 * fields at all, because this application must never collect a card number:
 * taking a PAN on our own form is what drags a merchant into PCI-DSS scope.
 */
export function CardTestCheckout({
  token,
  orderCode,
  amountLabel,
}: {
  token: string;
  orderCode: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function respond(outcome: 'approve' | 'decline') {
    setBusy(outcome);
    setResult(null);
    try {
      const response = await fetch('/api/card/test-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, result: outcome }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      const message = typeof payload.message === 'string' ? payload.message : null;
      if (response.ok) {
        setResult({
          ok: true,
          text:
            outcome === 'approve'
              ? `Notification delivered. The shop now shows order #${orderCode} as paid.`
              : `Decline delivered. Order #${orderCode} is marked as a failed payment.`,
        });
        setTimeout(() => router.push(`/pay/${token}`), 1400);
      } else {
        setResult({ ok: false, text: message ?? 'The gateway could not deliver that response.' });
      }
    } catch {
      setResult({ ok: false, text: 'Network error. Nothing was sent.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-300">
        <span className="font-semibold">Simulated gateway — nothing is charged.</span> No card
        network was contacted, no money moved, and this page would be the gateway&apos;s own
        domain in a live setup.
      </p>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-500">Card checkout</p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">#{orderCode}</h1>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-zinc-900">{amountLabel}</p>
        </header>

        <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm leading-relaxed text-zinc-600">
          <p className="font-medium text-zinc-800">Where the card form would be</p>
          <p className="mt-1.5">
            A live gateway renders its own secure fields here, served from its domain and posted to
            its servers. This shop never receives a card number, an expiry date or a CVV, and it
            stores no payment credentials of any kind.
          </p>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => respond('approve')}
            disabled={busy !== null}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === 'approve' ? 'Sending…' : 'Approve payment'}
          </button>
          <button
            type="button"
            onClick={() => respond('decline')}
            disabled={busy !== null}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy === 'decline' ? 'Sending…' : 'Decline'}
          </button>
        </div>

        {result ? (
          <p
            role="status"
            className={`mt-4 rounded-lg px-3 py-2 text-sm ring-1 ${
              result.ok
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : 'bg-rose-50 text-rose-700 ring-rose-200'
            }`}
          >
            {result.text}
          </p>
        ) : null}

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
          Approving sends a signed notification to <code>/api/webhook/CARD_HOSTED</code> — the same
          call a real gateway makes. A decline closes this order; the next purchase starts a new
          one.
        </p>
      </section>

      <a
        href={`/pay/${token}`}
        className="block text-center text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
      >
        Back to the order without paying
      </a>
    </div>
  );
}
