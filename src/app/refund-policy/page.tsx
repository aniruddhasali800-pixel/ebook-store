import Link from 'next/link';
import { AppChrome } from '@/components/AppChrome';
import {
  REFUND_REQUEST_WINDOW_HOURS,
  REFUND_REVIEW_WORKING_DAYS,
} from '@/lib/refunds';

// The footer names the payment methods on offer, which is runtime configuration,
// so this page must not be frozen into the build where cards happened to be off.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Refund policy' };

/**
 * The numbers on this page are imported, not retyped, from the module that decides
 * refunds — `REFUND_REQUEST_WINDOW_HOURS` is the same constant `refundEligibility()`
 * measures against. If the rule changes, the page changes with it.
 */
export default function RefundPolicyPage() {
  return (
    <AppChrome
      brand={{ mark: 'S', label: 'Super AI Books', href: '/' }}
      footer="This policy is the shop's own. It is not a payment company's template, and it does not promise anything the software cannot check."
    >
      <article className="mx-auto max-w-2xl space-y-6 text-[15px] leading-relaxed text-zinc-700">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Refunds</h1>
          <p className="mt-2 text-sm text-zinc-500">Written October 2026. This is the version the shop applies.</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">The short version</h2>
          <p>
            Ask within <strong>{REFUND_REQUEST_WINDOW_HOURS} hours</strong> of your payment being confirmed, and the
            shop answers within <strong>{REFUND_REVIEW_WORKING_DAYS} working days</strong>. If it is approved, the money
            is sent back by the shop itself and this page tells you when that happened.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Why the clock starts at confirmation
          </h2>
          <p>
            These are ebooks. Once a file has been opened there is no way to hand it back, so a refund here is a
            judgement, not a return. The shop would rather judge fairly than refuse everything, and a buyer who paid
            on Friday night and waited until Saturday morning for a verification should not lose eight hours of their
            window for something outside their control. So the window counts from the moment the payment was
            confirmed — the same instant your download unlocked.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What is usually refunded</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>The file does not open, is corrupted, or is not the book the page described.</li>
            <li>The wrong title was delivered, or the same order was charged twice.</li>
            <li>Price or amount mismatched against the invoice you agreed to.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What is usually refused</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>“I changed my mind” after reading most of it, with nothing wrong with the file.</li>
            <li>A request that arrived after the window and is not backed by a fault in the book.</li>
          </ul>
          <p>
            A refusal is not the end of the conversation. Every refusal carries a written reason on your receipt page,
            and you can answer it through the{' '}
            <Link href="/complaints-policy" className="underline underline-offset-2">
              complaint inbox
            </Link>
            . A person reads those.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            How the money actually comes back
          </h2>
          <p>
            Payments here arrive by UPI into the shop’s own account, or by card through a payment gateway. Neither
            gives this website the ability to move money back. There is no “refund” button in this software — a
            request only puts the amount, your reason and the deadline in front of a person.
          </p>
          <p>
            When that person approves it, they open their own UPI or banking app and send the money to you — normally
            to the account you paid from, or to the UPI ID you offered. Only after that do they type the transfer
            reference (a UTR or bank reference) into the dashboard. That is the moment this site is allowed to say
            <span className="font-medium text-zinc-900"> paid back</span>, and the reference is shown to you so it can
            be checked against your own statement.
          </p>
          <p>
            If you ever see a refund marked as sent with no reference next to it, that is a bug in this shop’s own
            rules — send a complaint and it will be fixed.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Working days</h2>
          <p>
            Saturdays, Sundays and the public holidays the shop lists in its own configuration do not count. A request
            filed on Friday evening is due by the end of Tuesday, not Monday. Deadlines on your receipt page are shown
            in Indian time because that is the shop’s day.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Cafe orders</h2>
          <p>
            The same window and the same review promise apply to food orders paid through the checkout. In practice a
            cold coffee that never arrived is settled by talking to the counter, and a request that arrives before the
            kitchen has even marked the order out is usually answered the same hour.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">How to ask</h2>
          <p className="mt-2">
            Open your receipt link — it is the page you paid from, and it is the only place a request can come from,
            because it proves the order is yours. There is a refunds panel at the bottom of it. If you have lost the
            link,{' '}
            <Link href="/complaints-policy" className="underline underline-offset-2">
              write a complaint
            </Link>{' '}
            with your order number and the shop will find it.
          </p>
        </section>
      </article>
    </AppChrome>
  );
}
