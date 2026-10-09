import { upiDirectProvider } from '@/lib/payments/upi-direct';
import { cardHostedProvider } from '@/lib/payments/card-hosted';
import {
  CARD_HOSTED_PROVIDER,
  UPI_DIRECT_PROVIDER,
  type PaymentProviderAdapter,
} from '@/lib/payments/types';

/**
 * Adapter registry. A gateway or webhook-backed provider is added by writing one
 * adapter and registering it here; nothing in the order flow changes.
 *
 *   registerPaymentProvider(razorpayCheckoutProvider);
 *
 * Order rows store the adapter id in `paymentMethod`, so an order keeps using
 * the provider it was created with even after another becomes the default.
 */
const providers = new Map<string, PaymentProviderAdapter>();

export function registerPaymentProvider(adapter: PaymentProviderAdapter): void {
  if (providers.has(adapter.id)) {
    throw new Error(`Payment provider "${adapter.id}" is already registered.`);
  }
  providers.set(adapter.id, adapter);
}

export function getPaymentProvider(id: string): PaymentProviderAdapter {
  const adapter = providers.get(id);
  if (!adapter) {
    throw new Error(`Unknown payment provider: ${id}`);
  }
  return adapter;
}

export function listPaymentProviders(): PaymentProviderAdapter[] {
  return [...providers.values()];
}

/**
 * What a customer may choose at the till. Adapters stay registered even when
 * unavailable so existing orders keep their provider; this only decides what
 * gets offered to new orders.
 *
 * Deliberately a plain `{ id, label }` — the till components are Client
 * Components, and an adapter's methods cannot cross that boundary.
 */
export type OfferedProvider = Pick<PaymentProviderAdapter, 'id' | 'label'>;

export function listOfferedPaymentProviders(): OfferedProvider[] {
  return listPaymentProviders()
    .filter((adapter) => adapter.available?.() ?? true)
    .map(({ id, label }) => ({ id, label }));
}

/**
 * Validate a choice that arrived from a form. Anything unknown, or a method that
 * is registered but switched off, falls back to the default rather than letting
 * a request pick a provider the business has not enabled.
 */
export function resolvePaymentProviderId(requested: unknown): string {
  if (typeof requested !== 'string') return DEFAULT_PAYMENT_PROVIDER_ID;
  const adapter = providers.get(requested);
  if (!adapter) return DEFAULT_PAYMENT_PROVIDER_ID;
  if (adapter.available && !adapter.available()) return DEFAULT_PAYMENT_PROVIDER_ID;
  return adapter.id;
}

registerPaymentProvider(upiDirectProvider);
registerPaymentProvider(cardHostedProvider);

export const DEFAULT_PAYMENT_PROVIDER_ID = UPI_DIRECT_PROVIDER;
export { CARD_HOSTED_PROVIDER, UPI_DIRECT_PROVIDER };
