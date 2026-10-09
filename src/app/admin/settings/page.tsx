import { requireStaff } from '@/lib/auth/session';
import { readPaymentSettings } from '@/lib/settings';
import { PaymentSettings } from '@/components/PaymentSettings';
import {
  getPaymentProvider,
  listOfferedPaymentProviders,
  listPaymentProviders,
} from '@/lib/payments/registry';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment settings' };

export default async function AdminSettingsPage() {
  const [staff, settings] = await Promise.all([requireStaff(), readPaymentSettings()]);
  const provider = getPaymentProvider('UPI_DIRECT');
  const cardOffered = listOfferedPaymentProviders().some(
    (adapter) => adapter.id === CARD_HOSTED_PROVIDER,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Payment settings</h1>
        <p className="mt-1 text-sm text-zinc-600">
          These details decide where customer money goes.
        </p>
      </header>

      <PaymentSettings settings={settings} canEdit={staff.role === 'ADMIN'} />

      <section className="max-w-xl rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-base font-semibold text-zinc-900">Active provider</h2>
        <p className="mt-1 text-zinc-600">
          {provider.label} — settlement is decided by staff verification because this provider
          cannot report money back to us.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-zinc-500">
          {listPaymentProviders().map((adapter) => (
            <li key={adapter.id} className="flex justify-between gap-3 border-t border-zinc-100 pt-1">
              <span className="font-mono">{adapter.id}</span>
              <span>
                {adapter.canSettle ? 'can confirm payment' : 'cannot confirm payment'}
                {' · '}
                {adapter.available?.() ?? true ? 'offered at the till' : 'not offered'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 leading-relaxed text-zinc-500">
          A new payment method is one adapter, not a new order flow: implement the same interface
          with <code>canSettle = true</code>, register it in{' '}
          <code>src/lib/payments/registry.ts</code>, and point the provider&apos;s notification URL
          at <code>POST /api/webhook/&lt;provider id&gt;</code>. The route verifies it and hands it
          to the state machine; nothing posts to <code>transitionPayment()</code> by hand.
        </p>
      </section>

      <section className="max-w-xl rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-base font-semibold text-zinc-900">Card payments</h2>
        <p className="mt-1.5 leading-relaxed text-zinc-600">
          {cardOffered
            ? 'The simulated gateway is running. Customers see a card option, and approving on its checkout page delivers a signed webhook — no card is charged and no money moves.'
            : 'No card option is offered right now. Card money cannot arrive as a UPI transfer, since a card clears through an acquirer into the merchant bank account, so taking one needs a payment gateway account of its own.'}
        </p>
        <dl className="mt-4 space-y-2 text-xs leading-relaxed">
          <div className="flex justify-between gap-4 border-t border-zinc-100 pt-2">
            <dt className="text-zinc-500">Webhook to register</dt>
            <dd className="text-right font-mono text-zinc-800">/api/webhook/{CARD_HOSTED_PROVIDER}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-zinc-100 pt-2">
            <dt className="text-zinc-500">Signature header</dt>
            <dd className="text-right font-mono text-zinc-800">x-provider-signature</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-zinc-100 pt-2">
            <dt className="text-zinc-500">Environment</dt>
            <dd className="text-right font-mono text-zinc-800">
              CARD_TEST_MODE, CARD_WEBHOOK_SECRET
            </dd>
          </div>
        </dl>
        <p className="mt-4 leading-relaxed text-zinc-500">
          Card numbers never appear anywhere in this application. The customer enters them on the
          gateway&apos;s hosted page, and that is precisely what keeps the shop out of PCI-DSS
          scope; a card field on our own form would put us inside it.
        </p>
      </section>
    </div>
  );
}
