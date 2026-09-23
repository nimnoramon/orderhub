import { ChannelKind, OrderStatus, SyncJobStatus } from '@/generated/prisma/enums';
import { prisma } from '@/server/db';
import { connectorState } from '@/server/channels/registry';
import { dropCache, readCache, writeCache } from '@/server/redis/cache';
import { dashboardKey } from '@/server/redis/keys';
import { lowStockVariants } from '@/server/services/stock';
import { LOW_STOCK_THRESHOLD } from '@/server/stock/levels';
import { jobSelect, mapSyncJob } from '@/server/sync/runner';
import { endOfUtcDayExclusive, startOfUtcDay } from '@/lib/dates';
import type { DashboardSummary, DashboardSummaryResponse } from '@/lib/types';

/**
 * The overview screen's numbers, and the only cache in this project.
 *
 * Six counts, none of them expensive on this data — which is the honest reason
 * to be careful about what a cache is for here. It is not for the database's
 * sake. It is for the page's: the overview is the screen a demo lands on, it is
 * the screen a visitor reloads, and it aggregates across four tables, so it is
 * the one read where a fixed sixty seconds of staleness buys something and
 * costs nothing anybody would notice.
 *
 * Everything else in this app reads through to Postgres, deliberately. A cache
 * in front of the orders list would have to be invalidated by every write in the
 * system, and the invalidation would be the bug.
 */

export const SUMMARY_TTL_SECONDS = 60;

/**
 * "Today" is a UTC day, through the same helper the orders filter uses. Every
 * stored timestamp is read in UTC, so a dashboard that decided today began at
 * midnight in the server's timezone would disagree with the orders list it
 * links to — on Vercel, in a way that depends on which region answered.
 */
const startOfToday = (now = new Date()): Date => startOfUtcDay(now.toISOString().slice(0, 10));

const ZERO_BY_STATUS = Object.fromEntries(
  Object.values(OrderStatus).map((status) => [status, 0]),
) as Record<OrderStatus, number>;

/**
 * How many variants are low somewhere.
 *
 * The tile counts the rows the stock service already knows how to find, rather
 * than deriving low stock a second time. Invariant 2 pins the arithmetic to one
 * pure function; this keeps the *question* — which variants are low — to one
 * implementation as well, so the number on the overview and the list the ask
 * panel reads out can never disagree about it.
 */
const countLowStock = async (merchantId: string): Promise<number> =>
  (await lowStockVariants(merchantId)).length;

/**
 * Orders and takings per channel over a window of whole UTC days.
 *
 * Deliberately not part of the cached summary: the summary is one fixed shape
 * for one screen, and this takes a date range, so caching it would mean a key
 * per range and an invalidation rule for each. It is a plain read, and its only
 * caller today asks it once per question.
 *
 * Cancellations are counted and then left out of the takings. The overview's
 * "taken today" tile includes them and says so, which is right for a tile that
 * has no room to explain itself; a caller asking which channel sold best wants
 * the money that stayed, and gets both numbers so it can say which it means.
 */
export type ChannelSales = {
  channelId: string;
  channel: string;
  kind: ChannelKind;
  orders: number;
  cancelledOrders: number;
  revenueCents: number;
};

export async function salesByChannel(
  merchantId: string,
  from: string,
  to: string,
): Promise<ChannelSales[]> {
  const [channels, grouped] = await Promise.all([
    prisma.channel.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, kind: true },
    }),
    prisma.order.groupBy({
      by: ['channelId', 'status'],
      where: { merchantId, placedAt: { gte: startOfUtcDay(from), lt: endOfUtcDayExclusive(to) } },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
  ]);

  const totals = new Map(
    channels.map((channel) => [
      channel.id,
      { ...channel, channelId: channel.id, channel: channel.name, orders: 0, cancelledOrders: 0, revenueCents: 0 },
    ]),
  );

  for (const row of grouped) {
    const total = totals.get(row.channelId);
    // A channel deleted between the two queries has orders and no name. Skipping
    // it loses a row; letting it through would crash the page for want of one.
    if (!total) continue;

    total.orders += row._count._all;
    if (row.status === OrderStatus.cancelled) total.cancelledOrders += row._count._all;
    else total.revenueCents += row._sum.totalCents ?? 0;
  }

  return [...totals.values()]
    .map(({ channelId, channel, kind, orders, cancelledOrders, revenueCents }) => ({
      channelId,
      channel,
      kind,
      orders,
      cancelledOrders,
      revenueCents,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.orders - a.orders);
}

/** The last run of any kind per channel — "when did we last talk to them". */
async function channelActivity(merchantId: string): Promise<DashboardSummary['channels']> {
  const channels = await prisma.channel.findMany({
    where: { merchantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true, lastSyncedAt: true },
  });

  return Promise.all(
    channels.map(async (channel) => {
      const job = await prisma.syncJob.findFirst({
        where: { channelId: channel.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: jobSelect,
      });

      return {
        id: channel.id,
        name: channel.name,
        kind: channel.kind,
        // Read from the registry rather than decided by the screen: "this kind
        // has no connector" is a fact about the code, and a dashboard that
        // worked it out from the channel's name would be free to be wrong
        // about it the day a second storefront is added.
        connector: connectorState(channel.kind),
        lastSyncedAt: channel.lastSyncedAt?.toISOString() ?? null,
        lastJob: job ? mapSyncJob(job) : null,
      };
    }),
  );
}

/** Computed fresh. Only `getDashboardSummary` should call this. */
async function computeSummary(merchantId: string): Promise<DashboardSummary> {
  const since = startOfToday();

  const [today, byStatus, lowStock, channels, failures] = await Promise.all([
    prisma.order.aggregate({
      where: { merchantId, placedAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
    prisma.order.groupBy({ by: ['status'], where: { merchantId }, _count: { _all: true } }),
    countLowStock(merchantId),
    channelActivity(merchantId),
    prisma.syncJob.findMany({
      where: {
        channel: { merchantId },
        status: { in: [SyncJobStatus.partial, SyncJobStatus.failed] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: jobSelect,
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    today: {
      orders: today._count._all,
      // A day with no orders sums to null, not to zero — the screen should not
      // have to know that about SQL.
      revenueCents: today._sum.totalCents ?? 0,
    },
    ordersByStatus: byStatus.reduce(
      (counts, row) => ({ ...counts, [row.status]: row._count._all }),
      { ...ZERO_BY_STATUS },
    ),
    lowStock: { variants: lowStock, threshold: LOW_STOCK_THRESHOLD },
    channels,
    recentFailures: failures.map(mapSyncJob),
  };
}

export async function getDashboardSummary(merchantId: string): Promise<DashboardSummaryResponse> {
  const key = dashboardKey(merchantId);

  const cached = await readCache<DashboardSummary>(key);
  if (cached) return { summary: cached, cached: true, ttlSeconds: SUMMARY_TTL_SECONDS };

  const summary = await computeSummary(merchantId);
  await writeCache(key, summary, SUMMARY_TTL_SECONDS);

  return { summary, cached: false, ttlSeconds: SUMMARY_TTL_SECONDS };
}

/**
 * Called by the writes that change what the summary says: an order moving
 * status, an order arriving from a channel, a stock movement, a sync finishing.
 *
 * It is deliberately not called from a database trigger or from a Prisma
 * middleware that watches every write. A list of four call sites is something a
 * reader can check against the summary's own fields; a hook that fires on
 * everything is something nobody can reason about, and it would drop the cache
 * on writes that change none of these numbers.
 *
 * Never throws: `dropCache` swallows a Redis failure, and a stale dashboard is
 * not a reason to fail the transition that was actually asked for.
 */
export async function invalidateDashboard(merchantId: string): Promise<void> {
  await dropCache(dashboardKey(merchantId));
}
