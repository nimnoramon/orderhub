'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OrderStatus } from '@/generated/prisma/enums';
import { useT } from '@/components/ui/I18nProvider';
// The rules come from the server module itself, not from a copy of them kept
// here. It is a pure table with no Prisma and no Next in it, so it bundles to
// the client, and a button is greyed out by the same function that would have
// answered 409 if it had been clicked anyway.
import { ACTIONABLE_STATUSES, canTransition, transitionRefusal } from '@/server/orders/state-machine';

export function TransitionActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const t = useT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(to: OrderStatus) {
    setError(null);
    setBusy(to);

    const response = await fetch(`/api/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, note: note.trim() || undefined }),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // The disabled buttons are a convenience; the server is the authority, and
      // a stale page that posts anyway gets the same answer an API client would.
      setError(body?.error?.message ?? t.orderDetail.actions.failed);
      setBusy(null);
      return;
    }

    setNote('');
    setBusy(null);
    router.refresh();
  }

  const stuck = ACTIONABLE_STATUSES.every((to) => !canTransition(status, to));

  return (
    <section className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {ACTIONABLE_STATUSES.map((to) => {
          // English even in Thai, like every other message a service produces:
          // this is the sentence the API would have answered with, and the tooltip
          // shows it rather than paraphrasing it. See the note in src/lib/i18n/en.ts.
          const refusal = transitionRefusal(status, to);
          const destructive = to === 'cancelled';
          return (
            <button
              key={to}
              type="button"
              onClick={() => move(to)}
              disabled={refusal !== null || busy !== null}
              title={refusal ?? undefined}
              className={
                refusal
                  ? 'cursor-not-allowed rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300'
                  : destructive
                    ? 'rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50'
                    : 'rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50'
              }
            >
              {busy === to ? t.common.saving : t.orderDetail.actions[to]}
            </button>
          );
        })}

        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
          <span className="sr-only">{t.orderDetail.actions.noteLabel}</span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.orderDetail.actions.notePlaceholder}
            maxLength={200}
            className="w-56 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-600 focus:outline-none"
          />
        </label>
      </div>

      {stuck && (
        <p className="mt-2 text-xs text-neutral-500">
          {t.orderDetail.actions.terminal(t.orderStatus[status])}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
