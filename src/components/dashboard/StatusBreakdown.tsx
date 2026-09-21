import Link from 'next/link';
import { OrderStatus } from '@/generated/prisma/enums';
import { serverMessages } from '@/server/i18n/locale';
import { ORDER_BAR, OrderStatusPill } from '@/components/ui/StatusPill';
import type { DashboardSummary } from '@/lib/types';

/**
 * Lifecycle order, not the enum's and not descending by count: this list is read
 * left to right as a pipeline, and a bar whose segments reorder themselves as
 * the numbers move is one nobody can compare against yesterday's screenshot.
 */
const LIFECYCLE = [
  OrderStatus.created,
  OrderStatus.paid,
  OrderStatus.packed,
  OrderStatus.shipped,
  OrderStatus.cancelled,
] as const;

export async function StatusBreakdown({
  ordersByStatus,
}: {
  ordersByStatus: DashboardSummary['ordersByStatus'];
}) {
  const t = await serverMessages();
  const total = LIFECYCLE.reduce((sum, status) => sum + ordersByStatus[status], 0);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-baseline gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{t.overview.breakdown.title}</h2>
        <span className="text-xs text-neutral-400 tabular-nums">
          {t.overview.breakdown.total(total)}
        </span>
      </header>

      {total === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500">
          {t.overview.breakdown.emptyLead}{' '}
          <Link href="/channels" className="underline underline-offset-4 hover:text-neutral-900">
            {t.overview.breakdown.emptyLink}
          </Link>{' '}
          {t.overview.breakdown.emptyTail} <code className="font-mono text-xs">pnpm db:seed</code>.
        </p>
      ) : (
        <div className="px-4 py-4">
          {/* Widths are the exact share, not the rounded percentage shown in the
              rows below — five rounded numbers do not add up to a full bar. */}
          <div
            className="flex h-2 overflow-hidden rounded-full bg-neutral-100"
            role="img"
            aria-label={LIFECYCLE.map((s) => `${ordersByStatus[s]} ${t.orderStatus[s]}`).join(', ')}
          >
            {LIFECYCLE.filter((status) => ordersByStatus[status] > 0).map((status) => (
              <div
                key={status}
                className={ORDER_BAR[status]}
                style={{ width: `${(ordersByStatus[status] / total) * 100}%` }}
              />
            ))}
          </div>

          <ul className="mt-3 flex flex-col">
            {LIFECYCLE.map((status) => (
              <li key={status}>
                <Link
                  href={`/orders?status=${status}`}
                  className="-mx-2 flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  <OrderStatusPill status={status} />
                  <span className="ml-auto tabular-nums text-neutral-900">
                    {ordersByStatus[status]}
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                    {Math.round((ordersByStatus[status] / total) * 100)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
