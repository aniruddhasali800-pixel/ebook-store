import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppChrome } from '@/components/AppChrome';
import { complaintByViewToken } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your complaint' };

/**
 * The public status page for one complaint, addressed by its random token.
 *
 * Nobody else can list these: there is no index, no name search, and the token is
 * 18 hex characters. That is what lets a buyer who has no order link still read the
 * shop's answer online instead of waiting on an email nobody promised.
 */
export default async function ComplaintStatusPage({
  params,
}: {
  params: Promise<{ ticket: string }>;
}) {
  const { ticket } = await params;
  const complaint = await complaintByViewToken(ticket);
  if (!complaint) notFound();

  return (
    <AppChrome
      brand={{ mark: 'S', label: 'Super AI Books', href: '/' }}
      footer="This page shows only the complaint you filed. Anyone with this link can read it, so keep it to yourself."
    >
      <div className="mx-auto max-w-xl space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Complaint {complaint.statusLabel.toLowerCase()}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">{complaint.subject}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Filed by {complaint.fromName} on {complaint.createdAtLabel}
            {complaint.orderCode ? ` · order #${complaint.orderCode}` : ''}
            {complaint.bookTitle ? ` · ${complaint.bookTitle}` : ''}
          </p>
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What you said</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{complaint.body}</p>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">The shop’s answer</h2>
          {complaint.reply ? (
            <>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-800">{complaint.reply}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {complaint.status === 'CLOSED' ? 'Closed' : 'Answered'} {complaint.answeredLabel}.
              </p>
            </>
          ) : complaint.status === 'CLOSED' ? (
            <p className="mt-2 text-sm text-zinc-600">
              This complaint was closed without a written reply.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Nothing has been written yet. The shop has two working days from the day you filed this to
              answer — check this page again, or read how that clock runs in the{' '}
              <Link href="/complaints-policy" className="underline underline-offset-2">
                complaints policy
              </Link>
              .
            </p>
          )}
        </section>

        <p className="text-xs leading-relaxed text-zinc-500">
          Your reference for this complaint is <span className="font-mono">{complaint.reference}</span>. If you
          need to follow up about a refund, mention it — the shop can find the file with this code.
        </p>
      </div>
    </AppChrome>
  );
}
