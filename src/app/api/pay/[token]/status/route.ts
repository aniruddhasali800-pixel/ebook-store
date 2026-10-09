import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Read-only status feed for the customer payment page. Exposes the two status
 * strings and nothing else — the payee VPA, bank reference and customer identity
 * stay server-side.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  await connection();
  const { token } = await context.params;

  const order = await prisma.order.findUnique({
    where: { token },
    select: { paymentStatus: true, status: true },
  });

  if (!order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Key names match what UpiPayment polls for; the lifecycle status is reported
  // as `orderStatus` so it is never confused with the payment status.
  return NextResponse.json(
    { paymentStatus: order.paymentStatus, orderStatus: order.status },
    { headers: { 'cache-control': 'no-store' } },
  );
}
