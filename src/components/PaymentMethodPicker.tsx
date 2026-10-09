import type { PaymentProviderAdapter } from '@/lib/payments/types';

/**
 * The till's choice of how to pay.
 *
 * Server-rendered on purpose: the options come from the adapter registry, and a
 * native radio group submits without any JavaScript, so a customer's choice
 * survives even if the page never hydrates. Selected styling is a CSS
 * `has-[:checked]` variant rather than component state.
 */
type MethodCopy = { label: string; hint: string };

const METHOD_COPY: Record<string, MethodCopy> = {
  UPI_DIRECT: {
    label: 'UPI',
    hint: 'Scan a QR or open a UPI app. The shop confirms the transfer.',
  },
  CARD_HOSTED: {
    label: 'Debit / credit card',
    hint: 'Opens the gateway’s own checkout page. Card details never touch this shop.',
  },
};

export function PaymentMethodPicker({
  providers,
  tone = 'light',
  value,
  onChange,
}: {
  providers: Pick<PaymentProviderAdapter, 'id' | 'label'>[];
  tone?: 'light' | 'dark';
  /**
   * Passing `value`/`onChange` makes the group controlled, which a cart needs in
   * order to read the choice from state instead of from a form submit.
   */
  value?: string;
  onChange?: (providerId: string) => void;
}) {
  // One option is not a choice; the order still carries its provider, it just
  // isn't something the customer has to think about.
  if (providers.length < 2) return null;
  const controlled = value !== undefined && onChange !== undefined;

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase text-zinc-500">
        Pay with
      </legend>
      {providers.map((provider, index) => {
        const copy = METHOD_COPY[provider.id] ?? { label: provider.label, hint: '' };
        return (
          <label
            key={provider.id}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-sm ring-1 transition has-[:checked]:ring-2 ${
              tone === 'dark'
                ? 'border-white/10 ring-white/15 text-zinc-200 has-[:checked]:bg-white/[0.06] has-[:checked]:ring-amber-400/70 hover:bg-white/[0.04]'
                : 'ring-zinc-300 text-zinc-800 has-[:checked]:bg-zinc-900/[0.04] has-[:checked]:ring-zinc-900 hover:bg-zinc-50'
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={provider.id}
              checked={controlled ? value === provider.id : undefined}
              defaultChecked={controlled ? undefined : index === 0}
              onChange={controlled ? () => onChange(provider.id) : undefined}
              className="mt-0.5 size-4 shrink-0 accent-zinc-900"
            />
            <span className="min-w-0">
              <span className="block font-medium">{copy.label}</span>
              {copy.hint ? (
                <span className={`mt-0.5 block text-xs leading-snug ${tone === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {copy.hint}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
