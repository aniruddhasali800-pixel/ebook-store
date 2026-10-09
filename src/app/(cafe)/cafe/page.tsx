import { listMenu } from '@/lib/orders';
import { readPaymentSettings } from '@/lib/settings';
import { listOfferedPaymentProviders } from '@/lib/payments/registry';
import { Cart } from '@/components/Cart';
import { ComplaintBox } from '@/components/ComplaintBox';
import { formatINR } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const [menu, settings, providers] = await Promise.all([
    listMenu(),
    readPaymentSettings(),
    listOfferedPaymentProviders(),
  ]);

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {settings.configured ? settings.businessName : 'Order ahead'}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
          Pick your items, then pay the shop directly. A QR code with the exact amount is
          generated for your order.
          {providers.length > 1
            ? ' Cards work too: the shop’s gateway hosts that step, so this site never sees a card number.'
            : ' No payment gateway sits between you and the shop, so no card details are ever collected.'}
        </p>
      </div>

      {menu.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-zinc-500 ring-1 ring-zinc-200">
          The menu is empty. Run <code className="text-zinc-700">npm run db:seed</code> to load
          sample items.
        </p>
      ) : (
        <Cart
          paymentsEnabled={settings.enabled}
          providers={providers}
          menu={menu.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            priceInPaise: item.priceInPaise,
          }))}
        />
      )}

      <p className="text-xs text-zinc-500">
        Prices shown in rupees, charged exactly as displayed (for example {formatINR(14900)} for a
        Masala Dosa).
      </p>

      <ComplaintBox existing={[]} />
    </div>
  );
}
