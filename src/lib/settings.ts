import 'server-only';
import { prisma } from '@/lib/db';
import { decryptSecret, encryptSecret, maskVpa } from '@/lib/crypto';
import { isValidVpa } from '@/lib/payments/upi';

export class PaymentSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentSettingsError';
  }
}

const SETTINGS_ID = 'default';

/**
 * What the admin UI is allowed to see. The payee VPA is stored AES-256-GCM
 * encrypted and only ever exposed masked, so a leaked settings payload cannot be
 * used to redirect payouts; changing it requires an authenticated staff action.
 */
export type PaymentSettingsView = {
  configured: boolean;
  enabled: boolean;
  businessName: string;
  payeeName: string;
  maskedVpa: string;
  currency: string;
  updatedAt: Date | null;
};

export type PayeeTarget = {
  vpa: string;
  payeeName: string;
  businessName: string;
};

const EMPTY_VIEW: PaymentSettingsView = {
  configured: false,
  enabled: false,
  businessName: '',
  payeeName: '',
  maskedVpa: '',
  currency: 'INR',
  updatedAt: null,
};

export async function readPaymentSettings(): Promise<PaymentSettingsView> {
  const settings = await prisma.paymentSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings) return EMPTY_VIEW;
  return {
    configured: true,
    enabled: settings.enabled,
    businessName: settings.businessName,
    payeeName: settings.upiPayeeName ?? settings.businessName,
    maskedVpa: settings.upiIdMasked,
    currency: settings.currency,
    updatedAt: settings.updatedAt,
  };
}

/** Decrypted payee for building payment intents. Server-side only. */
export async function loadPayeeTarget(): Promise<PayeeTarget> {
  const settings = await prisma.paymentSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings) {
    throw new PaymentSettingsError('UPI payments are not configured yet. Add a UPI ID in Payment Settings.');
  }
  if (!settings.enabled) {
    throw new PaymentSettingsError('UPI payments are currently disabled for this business.');
  }
  return {
    vpa: decryptSecret(settings.upiIdEncrypted),
    payeeName: settings.upiPayeeName ?? settings.businessName,
    businessName: settings.businessName,
  };
}

export type SaveSettingsInput = {
  businessName: string;
  upiId: string;
  /** Optional display name shown inside the customer's UPI app. */
  upiPayeeName?: string;
  enabled: boolean;
};

export async function savePaymentSettings(
  input: SaveSettingsInput,
  actorId: string,
): Promise<PaymentSettingsView> {
  const businessName = input.businessName.trim();
  const upiPayeeName = (input.upiPayeeName ?? '').trim();
  const vpa = input.upiId.trim().toLowerCase();

  if (businessName.length < 2 || businessName.length > 80) {
    throw new PaymentSettingsError('Business name must be between 2 and 80 characters.');
  }
  if (!isValidVpa(vpa)) {
    throw new PaymentSettingsError('Enter a valid UPI ID, for example businessname@bank.');
  }
  if (upiPayeeName.length > 50) {
    throw new PaymentSettingsError('UPI display name must be 50 characters or fewer.');
  }

  await prisma.paymentSetting.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      businessName,
      upiPayeeName: upiPayeeName || null,
      upiIdEncrypted: encryptSecret(vpa),
      upiIdMasked: maskVpa(vpa),
      enabled: input.enabled,
      updatedById: actorId,
    },
    update: {
      businessName,
      upiPayeeName: upiPayeeName || null,
      upiIdEncrypted: encryptSecret(vpa),
      upiIdMasked: maskVpa(vpa),
      enabled: input.enabled,
      updatedById: actorId,
    },
  });

  return readPaymentSettings();
}
