import Link from 'next/link';
import { AppChrome } from '@/components/AppChrome';
import { REFUND_REVIEW_WORKING_DAYS } from '@/lib/refunds';

// Same reason as the refund page: the footer has to describe today's payment
// methods, not the ones that were configured when this build was made.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Complaints' };

/**
 * Complaints are the last chance to keep a customer, so they get their own page and
 * their own inbox rather than being folded into the refund rules.
 */
export default function ComplaintsPolicyPage() {
  return (
    <AppChrome
      brand={{ mark: 'S', label: 'Super AI Books', href: '/' }}
      footer="A complaint here goes to the same person who reads the refund queue. There is no ticket bot on the other end."
    >
      <article className="mx-auto max-w-2xl space-y-6 text-[15px] leading-relaxed text-zinc-700">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Complaints and questions</h1>
          <p className="mt-2 text-sm text-zinc-500">Written October 2026.</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What counts as a complaint</h2>
          <p>
            Anything wrong: a file that will not open, a book that does not match its description, a payment that
            shows as unpaid when your statement says otherwise, a refund that was refused and you think was judged
            wrongly, a download link that stopped working, or a question about a title before you buy it. There is no
            category list to choose from and no form validation on tone.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Where to send it</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              From your <strong>receipt page</strong> — the link you paid from. Best option, because the complaint
              carries your order number automatically and the shop’s reply appears back on that same page.
            </li>
            <li>
              From any <strong>book page</strong> — for something about the book itself, before or after buying.
            </li>
            <li>
              From the <strong>cafe menu</strong> — for an order, a refund decision, or anything else.
            </li>
          </ul>
          <p>
            Leave a phone number or email if you want an answer somewhere else as well. It is optional when you write
            from a receipt page, because the reply is already on that page.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What the shop promises</h2>
          <p>
            A written answer within <strong>{REFUND_REVIEW_WORKING_DAYS} working days</strong> — the same clock the
            refund review runs on, counting Saturdays, Sundays and the shop’s listed holidays as free. Every complaint
            gets a status link when it is filed, and that link shows the reply the moment it is written. Keep it: it is
            the only way to read the answer online.
          </p>
          <p>
            Until someone answers, the page says so plainly instead of showing a fake “in progress” spinner. Nothing on
            this site pretends a complaint has been handled before a person has handled it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            What a complaint does not do
          </h2>
          <p>
            It does not move money. A complaint about a refund is read by the same person, and if they agree with you
            they will reopen the decision and pay — but the complaint itself cannot mark anything paid, approved or
            delivered. If you want your money back, use the refunds panel on the receipt page; if you want the shop to
            explain itself, use this one.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Escalation</h2>
          <p>
            This is a small shop selling its own books and coffee, so there is no internal appeals ladder. If an answer
            does not satisfy you, the next step is your own bank or UPI app — a dispute raised with the payer’s side is
            a legitimate route and the shop will not treat you differently for using it. Anything over a larger amount
            falls under India’s consumer protection rules, and the shop’s business name and UPI ID are printed on every
            receipt so a complaint has something concrete to name.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Spam</h2>
          <p className="mt-2">
            There is no captcha. The form has an invisible field that a human never sees; a script that fills
            everything in gets a polite “Received.” and nothing is stored. Real complaints are never rate-limited or
            hidden behind a sign-in.
          </p>
          <p className="mt-2">
            Read the money rules in the{' '}
            <Link href="/refund-policy" className="underline underline-offset-2">
              refund policy
            </Link>
            .
          </p>
        </section>
      </article>
    </AppChrome>
  );
}
