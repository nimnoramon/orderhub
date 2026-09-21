import { formatDateTime } from '@/lib/dates';
import { requireMerchantId } from '@/server/auth/session';
import { getDashboardSummary } from '@/server/services/dashboard';
import { ChannelActivity } from '@/components/dashboard/ChannelActivity';
import { RecentFailures } from '@/components/dashboard/RecentFailures';
import { StatusBreakdown } from '@/components/dashboard/StatusBreakdown';
import { SummaryTiles } from '@/components/dashboard/SummaryTiles';

// The summary has its own sixty-second cache; the route cache on top of it would
// be a second one with no way to drop it, and the whole point of this screen is
// that a transition made on another tab shows up here.
export const dynamic = 'force-dynamic';

/**
 * The overview.
 *
 * It calls the service rather than fetching its own `/api/dashboard/summary`.
 * The rule this project keeps is that `app/` never touches Prisma — not that a
 * page must talk to itself over HTTP, which would cost a second round trip, an
 * absolute URL to build and a session cookie to forward, to arrive at the same
 * cached function. The endpoint stays because an API surface is for programs;
 * this screen is not one of them.
 */
export default async function OverviewPage() {
  const merchantId = await requireMerchantId();
  const { summary, cached, ttlSeconds } = await getDashboardSummary(merchantId);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Six numbers that say whether the day is going well and whether the channels are still
          talking to us.
        </p>
      </header>

      <SummaryTiles summary={summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusBreakdown ordersByStatus={summary.ordersByStatus} />
        <ChannelActivity channels={summary.channels} />
      </div>

      <RecentFailures failures={summary.recentFailures} />

      {/* The cache, stated on the screen it serves. It is the one read in this
          app that is not read through to Postgres, so the page says when the
          numbers were computed and whether this particular render paid for
          them — a demo of a cache that cannot be seen working is a claim. */}
      <p className="text-xs text-neutral-400">
        Computed {formatDateTime(summary.generatedAt)} ·{' '}
        {cached ? 'served from Redis' : 'computed for this request'} · recomputed at most once every{' '}
        {ttlSeconds} seconds, and immediately after a status change, an order arriving from a
        channel, a stock movement or a finished sync.
      </p>
    </div>
  );
}
