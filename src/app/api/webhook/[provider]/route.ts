import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { handleProviderWebhook } from '@/lib/payments/webhook';

export const dynamic = 'force-dynamic';

/**
 * Where a payment provider reports what actually happened to a payment.
 *
 * This is the only route that may settle an order without a human, and it owns
 * nothing but the handoff: signature verification lives on the adapter, the
 * state machine and the amount check live in `handleProviderWebhook`. Nothing
 * here reads a query string for the outcome — the raw body is what gets
 * verified, exactly as the sender serialized it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  const rawBody = await request.text();
  const result = await handleProviderWebhook(provider, { rawBody, headers: request.headers });

  if (result.status === 200 && result.body.applied) {
    revalidatePath('/admin');
    revalidatePath('/dashboard');
  }

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed', message: 'Provider notifications are delivered by POST.' },
    { status: 405 },
  );
}
