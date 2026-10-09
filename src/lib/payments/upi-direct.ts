import QRCode from 'qrcode';
import { buildUpiUri, type UpiPaymentParams } from '@/lib/payments/upi';
import {
  UPI_DIRECT_PROVIDER,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentProviderAdapter,
  type ProviderStatusResult,
} from '@/lib/payments/types';

/**
 * QR rendering happens server-side and is handed to the page as a data URL, so
 * the same builder produces both the scannable image and the mobile deep link.
 */
async function toQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

function intentFromInput(input: CreateIntentInput): {
  params: UpiPaymentParams;
  upiUri: string;
  payeeVpa: string;
} {
  const params: UpiPaymentParams = {
    payeeVpa: input.payee.vpa,
    payeeName: input.payee.name,
    amountInPaise: input.amountInPaise,
    transactionRef: input.orderCode,
    currency: 'INR',
  };
  if (input.noteText) params.noteText = input.noteText;
  if (input.merchantCode) params.merchantCode = input.merchantCode;

  const built = buildUpiUri(params);
  return { params, upiUri: built.uri, payeeVpa: built.params.pa };
}

/**
 * Direct-to-VPA payments. The customer's UPI app talks to the bank; this
 * application never sees the result, which is exactly why `canSettle` is false
 * and `queryStatus` reports "unproven" instead of guessing.
 */
export const upiDirectProvider: PaymentProviderAdapter = {
  id: UPI_DIRECT_PROVIDER,
  label: 'UPI direct (QR / app deep link)',
  canSettle: false,

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const { upiUri, payeeVpa } = intentFromInput(input);
    return {
      provider: UPI_DIRECT_PROVIDER,
      orderCode: input.orderCode,
      amountInPaise: input.amountInPaise,
      currency: 'INR',
      payeeVpa,
      upiUri,
      qrDataUrl: await toQrDataUrl(upiUri),
    };
  },

  async queryStatus(): Promise<ProviderStatusResult> {
    return {
      settled: false,
      message:
        'Direct UPI payments have no confirmation channel. Settlement requires staff verification against the bank statement.',
    };
  },
};

export { toQrDataUrl };
