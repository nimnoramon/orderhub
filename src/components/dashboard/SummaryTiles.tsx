import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCents } from '@/lib/money';
import { serverMessages } from '@/server/i18n/locale';
import type { DashboardSummary } from '@/lib/types';

const CARD =
  'rounded-lg border border-neutral-200 bg-white px-4 py-3 transition hover:border-neutral-300';

/**
 * One number, what it counts, and where to go to see the rows behind it.
 *
 * Every tile links somewhere. A dashboard figure nobody can drill into is a
 * figure nobody can check, and "47 low" is only useful if the next click is the
 * list of which ones.
 */
function Tile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className={CARD}>
      <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
    </Link>
  );
}

export async function SummaryTiles({ summary }: { summary: DashboardSummary }) {
  const t = await serverMessages();
  const { today, ordersByStatus, lowStock } = summary;

  // Not shipped and not cancelled: the orders somebody still has to do something
  // about. Derived from the same counts the breakdown below renders, so the two
  // cannot disagree about how many orders are in flight.
  const open = ordersByStatus.created + ordersByStatus.paid + ordersByStatus.packed;

  // The day the numbers are about, taken from the summary rather than from the
  // clock: this response may have been computed up to a minute ago, and a link
  // that filtered on a different day than the tile counted would be wrong for
  // exactly as long as it took somebody to notice.
  const day = summary.generatedAt.slice(0, 10);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label={t.overview.tiles.ordersToday}
        value={String(today.orders)}
        hint={t.overview.tiles.ordersTodayHint(day)}
        href={`/orders?from=${day}&to=${day}`}
      />
      <Tile
        label={t.overview.tiles.takenToday}
        // The demo merchant sells in one currency, so the day's takings are a
        // single sum. A merchant with more would need this grouped by currency —
        // adding the numbers together would be the bug, and converting them to a
        // display currency at read time would be the second one.
        value={formatCents(today.revenueCents)}
        hint={t.overview.tiles.takenTodayHint}
        href={`/orders?from=${day}&to=${day}`}
      />
      <Tile
        label={t.overview.tiles.openOrders}
        value={String(open)}
        hint={t.overview.tiles.openOrdersHint}
        href="/orders"
      />
      <Tile
        label={t.overview.tiles.lowStock}
        value={String(lowStock.variants)}
        hint={t.overview.tiles.lowStockHint(lowStock.threshold)}
        href="/products"
      />
    </div>
  );
}
