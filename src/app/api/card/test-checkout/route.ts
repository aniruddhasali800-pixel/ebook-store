import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { prisma } from '@/lib/db';
import { cardCheckoutEnabled, signCardWebhook, type CardWebhookPayload } from '@/lib/payments/card-hosted';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';
import { handleProviderWebhook } from '@/lib/payments/webhook';

export const dynamic = 'force-dynamic';

/**
 * The simulated card network's side of the test gateway.
 *
 * Pressing "Approve" here is what a real gateway's server would do: build a
 * payload, sign it with the shared secret, and deliver it to
 * `/api/webhook/CARD_HOSTED`. The delivery is a direct function call rather
 * than an HTTP loopback, but the payload and the signature are identical, so
 * the code being exercised is the production code — including the amount check
 * and the state machine.
 *
 * Nothing about this route touches a card number. There is no card field to
 * fill in, on this page or anywhere else in the app: a hosted checkout means
 * the customer types it on the gateway's own domain, and that is precisely why
 * this application stays outside PCI-DSS scope.
 */
export async function POST(request: Request) {
  await connection();

  if (!cardCheckoutEnabled()) {
    return NextResponse.json(
      { error: 'test_mode_off', message: 'The simulated gateway is not enabled on this deployment.' },
      { status: 404 },
    );
  }

  let token = '';
  let approve = false;
  try {
    const body = (await request.json()) as { token?: unknown; result?: unknown };
    token = typeof body.token === 'string' ? body.token : '';
    approve = body.result === 'approve';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { token },
    select: { orderId: true, totalInPaise: true, paymentMethod: true, paymentStatus: true },
  });
  if (!order || order.paymentMethod !== CARD_HOSTED_PROVIDER) {
    return NextResponse.json({ error: 'unknown_order' }, { status: 404 });
  }

  const payload: CardWebhookPayload = {
    provider: CARD_HOSTED_PROVIDER,
    eventId: randomBytes(8).toString('hex'),
    orderCode: order.orderId,
    status: approve ? 'PAID' : 'FAILED',
    amountInPaise: order.totalInPaise,
    reference: approve ? `TESTCARD${randomBytes(5).toString('hex').toUpperCase()}` : '',
  };

  const rawBody = JSON.stringify(payload);
  const result = await handleProviderWebhook(CARD_HOSTED_PROVIDER, {
    rawBody,
    headers: new Headers({
      'content-type': 'application/json',
      'x-provider-signature': signCardWebhook(rawBody),
    }),
  });

  return NextResponse.json(
    { ...result.body, applied: result.body.applied === true },
    { status: result.status, headers: { 'cache-control': 'no-store' } },
  );
}
