'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MANUAL_REASONS, createMovement } from '@/lib/schemas/stock';
import type { WarehouseRef } from '@/lib/types';

type Props = {
  variant: { id: string; sku: string };
  warehouse: WarehouseRef;
  onHand: number;
  onClose: () => void;
};

type Reason = (typeof MANUAL_REASONS)[number];

/**
 * Writes one movement. There is no "set stock to" field anywhere in this dialog
 * on purpose — the ledger records what changed, not what someone decided the
 * number should be, and the difference is the audit trail.
 *
 * Validation is the same zod schema the route handler parses, so the form and
 * the API cannot drift apart.
 */
export function AdjustStockDialog({ variant, warehouse, onHand, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState<Reason>('adjustment');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => dialogRef.current?.showModal(), []);

  const delta = (direction === 'add' ? 1 : -1) * (Number(qty) || 0);
  const resulting = onHand + delta;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = createMovement.safeParse({
      variantId: variant.id,
      warehouseId: warehouse.id,
      delta,
      reason,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setSaving(true);
    const response = await fetch('/api/stock/movements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // The server is the authority on whether this adjustment is allowed — the
      // preview below is a courtesy, not the check.
      setError(body?.error?.message ?? 'The adjustment could not be saved');
      setSaving(false);
      return;
    }

    router.refresh();
    dialogRef.current?.close();
  }

  const label = 'block text-xs font-medium uppercase tracking-wide text-neutral-400';
  const field =
    'mt-1 w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:border-teal-600 focus:outline-none';

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-200 p-0 backdrop:bg-neutral-900/30"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Adjust stock</h2>
          <p className="mt-1 text-xs text-neutral-500">
            <span className="font-mono">{variant.sku}</span> in {warehouse.name} ({warehouse.code}) —{' '}
            <span className="tabular-nums">{onHand}</span> on hand
          </p>
        </div>

        <div className="flex gap-3">
          <div className="flex rounded-md border border-neutral-200 p-0.5">
            {(['add', 'remove'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDirection(value)}
                className={
                  direction === value
                    ? 'rounded px-3 py-1 text-sm font-medium bg-neutral-900 text-white'
                    : 'rounded px-3 py-1 text-sm text-neutral-500 hover:text-neutral-900'
                }
              >
                {value === 'add' ? 'Add' : 'Remove'}
              </button>
            ))}
          </div>

          <label className="flex-1">
            <span className="sr-only">Quantity</span>
            <input
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              autoFocus
            />
          </label>
        </div>

        <label className="block">
          <span className={label}>Reason</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as Reason)}
            className={field}
          >
            {MANUAL_REASONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={label}>Note</span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Cycle count, damaged in transit…"
            className={field}
          />
        </label>

        <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          Writes one movement of{' '}
          <span className="font-medium tabular-nums text-neutral-900">
            {delta > 0 ? `+${delta}` : delta}
          </span>
          . {warehouse.code} would hold <span className="tabular-nums">{resulting}</span>.
        </p>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save movement'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
