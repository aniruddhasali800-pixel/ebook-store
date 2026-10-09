'use client';

import { useActionState, useOptimistic, useState } from 'react';
import type { BookLedgerRow, MovementRow, StockRow } from '@/lib/inventory/stock';
import type { StaffFormState } from '@/lib/actions/staff';
import {
  createStockItemAction,
  recordCountAction,
  recordRestockAction,
  recordWriteOffAction,
  setParLevelAction,
} from '@/lib/actions/inventory';

type MenuOption = { id: string; name: string; category: string; tracked: boolean };

const inputClass =
  'rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10';

/**
 * The admin's shelf list.
 *
 * The count is written optimistically the moment a form is submitted and the
 * server's answer replaces it a moment later. That is safe here and only here:
 * the arithmetic of "I counted nine" is something the client already knows the
 * result of, so nothing invented is shown — if the two disagree, the page is
 * re-rendered from the database and the server figure wins.
 */
export function InventoryBoard({
  rows,
  movements,
  books,
  menuItems,
}: {
  rows: StockRow[];
  movements: MovementRow[];
  books: BookLedgerRow[];
  menuItems: MenuOption[];
}) {
  const [selectedId, setSelectedId] = useState<string>(rows[0]?.id ?? '');
  const [mode, setMode] = useState<'count' | 'restock' | 'write_off' | 'par'>('count');
  const [displayRows, applyOptimistic] = useOptimistic(
    rows,
    (state: StockRow[], change: { id: string; quantityOnHand: number }) =>
      state.map((row) => (row.id === change.id ? { ...row, quantityOnHand: change.quantityOnHand } : row)),
  );

  const selected = displayRows.find((row) => row.id === selectedId) ?? displayRows[0];
  const low = displayRows.filter((row) => row.state === 'LOW');

  return (
    <div className="space-y-6">
      {low.length > 0 ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <strong className="font-semibold">{low.length} item{low.length === 1 ? '' : 's'}</strong> at or
          under the reorder level: {low.map((row) => `${row.name} (${row.quantityOnHand} ${row.unit})`).join(', ')}.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">On the shelf</h2>
          <p className="text-xs text-zinc-500">
            Figures change when a staff member marks an order paid — never when somebody only says they
            paid.
          </p>
        </header>

        {displayRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            Nothing is being counted yet. Add the first thing you actually run out of — batter, milk,
            cups — not the whole menu.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">On hand</th>
                <th className="px-3 py-2 text-right font-medium">Reorder at</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-5 py-2 text-right font-medium">Ledger</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-zinc-50 last:border-0 ${selected?.id === row.id ? 'bg-zinc-50/70' : ''}`}
                >
                  <td className="px-5 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="text-left font-medium text-zinc-900 hover:underline"
                    >
                      {row.name}
                    </button>
                    <span className="block text-[11px] text-zinc-500">
                      {row.menuItemName ? `drained by ${row.menuItemName}` : 'not tied to a till item'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold tabular-nums text-zinc-900">{row.quantityOnHand}</span>
                    <span className="ml-1 text-xs text-zinc-500">{row.unit}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600">
                    {row.parLevel > 0 ? row.parLevel : <span className="text-zinc-400">not set</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <StateBadge state={row.state} />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.id);
                        setMode('count');
                      }}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      Record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selected ? (
          <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {(['count', 'restock', 'write_off', 'par'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  aria-pressed={mode === key}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    mode === key
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900'
                  }`}
                >
                  {key === 'count'
                    ? 'I counted them'
                    : key === 'restock'
                      ? 'Stock came in'
                      : key === 'write_off'
                        ? 'Lost or used up'
                        : 'Reorder level'}
                </button>
              ))}
              <span className="ml-auto text-xs text-zinc-500">
                {selected.name} — reads <strong className="tabular-nums text-zinc-800">{selected.quantityOnHand} {selected.unit}</strong>
              </span>
            </div>

            <div className="mt-3">
              {mode === 'count' ? (
                <CountForm key={`count-${selected.id}`} row={selected} onOptimistic={applyOptimistic} />
              ) : mode === 'par' ? (
                <ParForm key={`par-${selected.id}`} row={selected} />
              ) : (
                <AdjustForm
                  key={`${mode}-${selected.id}`}
                  row={selected}
                  kind={mode}
                  onOptimistic={applyOptimistic}
                />
              )}
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <AddItemForm menuItems={menuItems.filter((item) => !item.tracked)} />

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Recently moved</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Every unit in or out, newest first. A sale row names the order it came from; a short row says
            the shelf was emptier than the ledger thought.
          </p>
          {movements.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No movements recorded yet.</p>
          ) : (
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {movements.map((movement) => (
                <li key={movement.id} className="flex items-baseline gap-2 border-b border-zinc-50 pb-1 text-xs last:border-0">
                  <span
                    className={`w-14 shrink-0 font-semibold tabular-nums ${
                      movement.deltaUnits > 0 ? 'text-emerald-700' : movement.deltaUnits < 0 ? 'text-zinc-800' : 'text-zinc-400'
                    }`}
                  >
                    {movement.deltaUnits > 0 ? `+${movement.deltaUnits}` : movement.deltaUnits}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-zinc-900">{movement.stockItemName}</span>
                    <span className="text-zinc-500">
                      {' → '}
                      {movement.balanceAfter}
                      {movement.orderCode ? ` · order #${movement.orderCode}` : ''}
                      {movement.shortByUnits > 0 ? ` · short ${movement.shortByUnits}` : ''}
                      {movement.actorName ? ` · ${movement.actorName}` : ''}
                    </span>
                    {movement.note ? (
                      <span className="block truncate text-[11px] text-zinc-400">{movement.note}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400">
                    {movement.kind.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BooksLedger books={books} />
    </div>
  );
}

function StateBadge({ state }: { state: StockRow['state'] }) {
  if (state === 'LOW') {
    return (
      <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-800 ring-1 ring-rose-200">
        reorder
      </span>
    );
  }
  if (state === 'UNSET') {
    return <span className="text-[11px] text-zinc-400">no level set</span>;
  }
  return (
    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200">
      ok
    </span>
  );
}

function Result({ state }: { state: StaffFormState }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
      {state.message}
    </p>
  );
}

function CountForm({
  row,
  onOptimistic,
}: {
  row: StockRow;
  onOptimistic: (change: { id: string; quantityOnHand: number }) => void;
}) {
  const [state, action, pending] = useCountAction(row, onOptimistic);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="stockItemId" value={row.id} />
      <label className="text-xs text-zinc-600">
        Units actually on the shelf
        <input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          name="counted"
          required
          defaultValue={row.quantityOnHand}
          className={`${inputClass} mt-1 block w-32`}
        />
      </label>
      <label className="flex-1 text-xs text-zinc-600">
        Why it differs, if it does
        <input
          type="text"
          name="note"
          maxLength={200}
          placeholder="spilled a bag, ledger was wrong, counted the fridge"
          className={`${inputClass} mt-1 w-full`}
        />
      </label>
      <SubmitButton pending={pending} label="Save count" />
      <Result state={state} />
    </form>
  );
}

function AdjustForm({
  row,
  kind,
  onOptimistic,
}: {
  row: StockRow;
  kind: 'restock' | 'write_off';
  onOptimistic: (change: { id: string; quantityOnHand: number }) => void;
}) {
  const [state, action, pending] = useAdjustAction(row, kind, onOptimistic);
  const restock = kind === 'restock';
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="stockItemId" value={row.id} />
      <label className="text-xs text-zinc-600">
        {restock ? 'Units that arrived' : 'Units gone without a sale'}
        <input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          name="units"
          required
          className={`${inputClass} mt-1 block w-28`}
        />
      </label>
      <label className="flex-1 text-xs text-zinc-600">
        {restock ? 'From where' : 'What happened'}
        <input
          type="text"
          name="note"
          required
          maxLength={200}
          placeholder={restock ? 'Rice supplier, 4 bags, 12 Oct' : 'burnt during service, 3 plates'}
          className={`${inputClass} mt-1 w-full`}
        />
      </label>
      <SubmitButton pending={pending} label={restock ? 'Add to stock' : 'Write off'} />
      <Result state={state} />
    </form>
  );
}

function ParForm({ row }: { row: StockRow }) {
  const [state, action, pending] = useActionState(setParLevelAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="stockItemId" value={row.id} />
      <label className="text-xs text-zinc-600">
        Flag it when the count reaches this
        <input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          name="parLevel"
          required
          defaultValue={row.parLevel || undefined}
          className={`${inputClass} mt-1 block w-28`}
        />
      </label>
      <SubmitButton pending={pending} label="Set level" />
      <Result state={state} />
    </form>
  );
}

function AddItemForm({ menuItems }: { menuItems: MenuOption[] }) {
  const [state, action, pending] = useActionState(createStockItemAction, undefined);

  return (
    <form
      action={action}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200"
    >
      <h2 className="text-base font-semibold text-zinc-900">Track something new</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Tie it to a till item and every paid order for that item will pull from it. Leave it untied and
        it stays a number you count by hand.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-600">
          Name
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            placeholder="Dosa batter"
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
        <label className="text-xs text-zinc-600">
          One unit is
          <input
            type="text"
            name="unit"
            maxLength={20}
            placeholder="plates, bags, litres"
            defaultValue="units"
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
        <label className="text-xs text-zinc-600">
          Till item it drains
          <select name="menuItemId" className={`${inputClass} mt-1 w-full`}>
            <option value="">Nothing — count it by hand</option>
            {menuItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-600">
            Count now
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              name="openingCount"
              required
              defaultValue={0}
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <label className="text-xs text-zinc-600">
            Reorder at
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              name="parLevel"
              required
              defaultValue={0}
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} label="Add to inventory" />
        <Result state={state} />
      </div>
    </form>
  );
}

function BooksLedger({ books }: { books: BookLedgerRow[] }) {
  const missingFile = books.filter((book) => !book.hasFile);
  const sold = books.reduce((total, book) => total + book.copiesSold, 0);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Book shop</h2>
        <p className="text-xs text-zinc-500">
          {sold} cop{sold === 1 ? 'y' : 'ies'} delivered — an ebook has no stock to run out of, so this is
          a sales ledger, not a shelf
        </p>
      </header>
      {missingFile.length > 0 ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm leading-relaxed text-rose-900 ring-1 ring-rose-200">
          {missingFile.length} title{missingFile.length === 1 ? ' has' : 's have'} no file attached
          ({missingFile.map((book) => book.title).join(', ')}). A buyer who pays for one of those gets
          nothing to download.
        </p>
      ) : null}
      <ul className="mt-4 divide-y divide-zinc-50 text-sm">
        {books.map((book) => (
          <li key={book.id} className="flex items-baseline gap-3 py-2">
            <span className="min-w-0 flex-1 text-zinc-900">{book.title}</span>
            {!book.published ? (
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">not published</span>
            ) : null}
            <span className="tabular-nums text-zinc-600">{book.copiesSold} sold</span>
            <span
              className={`w-24 text-right text-[11px] font-medium uppercase tracking-wider ${
                book.hasFile ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {book.hasFile ? 'file ready' : 'no file'}
            </span>
          </li>
        ))}
        {books.length === 0 ? <li className="py-4 text-sm text-zinc-500">No titles on file.</li> : null}
      </ul>
    </section>
  );
}

/**
 * `useActionState` takes a client-side handler, so the optimistic write happens
 * here first and the server action runs behind it. Both arithmetic branches match
 * `src/lib/inventory/ledger.ts` — a count sets the figure, a delivery adds to it, a
 * write-off can only take as much as is there.
 */
function useCountAction(
  row: StockRow,
  onOptimistic: (change: { id: string; quantityOnHand: number }) => void,
) {
  return useActionState<StaffFormState, FormData>(
    async (prev, formData) => {
      const counted = Number(formData.get('counted'));
      if (Number.isInteger(counted) && counted >= 0) onOptimistic({ id: row.id, quantityOnHand: counted });
      return recordCountAction(prev, formData);
    },
    undefined,
  );
}

function useAdjustAction(
  row: StockRow,
  kind: 'restock' | 'write_off',
  onOptimistic: (change: { id: string; quantityOnHand: number }) => void,
) {
  return useActionState<StaffFormState, FormData>(
    async (prev, formData) => {
      const units = Number(formData.get('units'));
      if (Number.isInteger(units) && units > 0) {
        onOptimistic({
          id: row.id,
          quantityOnHand:
            kind === 'restock' ? row.quantityOnHand + units : Math.max(0, row.quantityOnHand - units),
        });
      }
      return kind === 'restock' ? recordRestockAction(prev, formData) : recordWriteOffAction(prev, formData);
    },
    undefined,
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}
