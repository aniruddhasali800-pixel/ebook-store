import assert from 'node:assert/strict';
import { test } from 'node:test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { upiDirectProvider } from '../src/lib/payments/upi-direct';
import { parseUpiUri } from '../src/lib/payments/upi';

/**
 * Decodes the rendered QR image exactly the way a phone camera would, so the
 * test proves "what the customer scans" rather than "what we intended to draw".
 */
function decodeQrDataUrl(dataUrl: string): string {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(result?.data, 'QR code could not be decoded');
  return result.data;
}

const ORDER = {
  orderCode: '49912',
  amountInPaise: 49900,
  currency: 'INR',
  payee: { vpa: 'demo-cafe@okhdfcbank', name: 'Demo Cafe' },
  noteText: 'Order #49912',
};

test('the QR image decodes to the same UPI URI the app built', async () => {
  const intent = await upiDirectProvider.createIntent(ORDER);

  assert.ok(intent.qrDataUrl?.startsWith('data:image/png;base64,'));
  const scanned = decodeQrDataUrl(intent.qrDataUrl!);
  assert.equal(scanned, intent.upiUri);
});

test('a scanned QR carries the right payee, amount and reference', async () => {
  const intent = await upiDirectProvider.createIntent(ORDER);
  const scanned = parseUpiUri(decodeQrDataUrl(intent.qrDataUrl!));

  assert.equal(scanned.pa, 'demo-cafe@okhdfcbank');
  assert.equal(scanned.pn, 'Demo Cafe');
  assert.equal(scanned.am, '499.00');
  assert.equal(scanned.cu, 'INR');
  assert.equal(scanned.tr, '49912');
  assert.equal(scanned.tn, 'Order #49912');
});

test('a different amount produces a different QR', async () => {
  const [a, b] = await Promise.all([
    upiDirectProvider.createIntent(ORDER),
    upiDirectProvider.createIntent({ ...ORDER, amountInPaise: 49901 }),
  ]);
  assert.notEqual(a.qrDataUrl, b.qrDataUrl);
  assert.equal(parseUpiUri(decodeQrDataUrl(b.qrDataUrl!)).am, '499.01');
});

test('direct UPI can never self-report settlement', async () => {
  assert.equal(upiDirectProvider.canSettle, false);
  const status = await upiDirectProvider.queryStatus({
    orderCode: '49912',
    provider: 'UPI_DIRECT',
  });
  assert.equal(status.settled, false);
});
