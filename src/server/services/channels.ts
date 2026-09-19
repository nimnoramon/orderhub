import { SyncJobType } from '@/generated/prisma/enums';
import { prisma } from '@/server/db';
import { connectorState } from '@/server/channels/registry';
import { jobSelect, mapSyncJob } from '@/server/sync/runner';
import type { ChannelRef, ChannelSummary } from '@/lib/types';

/**
 * Channels as the rest of the app needs to refer to them: an id, a name and a
 * kind. This is the read the orders screens need to name a channel and fill
 * their filter; the Channels screen wants more, and asks below.
 */
export async function listChannels(merchantId: string): Promise<ChannelRef[]> {
  return prisma.channel.findMany({
    where: { merchantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true },
  });
}

const JOB_TYPES = [SyncJobType.catalog_push, SyncJobType.order_pull] as const;

/**
 * Everything the Channels screen shows.
 *
 * "Last synced" is read from the `SyncJob` table rather than from a column kept
 * up to date beside it. The runs are already recorded, so a `lastCatalogPushAt`
 * would be a second copy of a fact the log already holds — the same reasoning
 * that keeps stock derived from its movements. `Channel.lastSyncedAt` stays for
 * what it actually means: how far the order feed has been read, which milestone
 * 5 advances alongside the cursor.
 *
 * One query per channel per job type. That is six on this demo's data and grows
 * with the number of channels a merchant has connected, not with their history —
 * a DISTINCT ON would collapse it into one, at the price of raw SQL for a read
 * that runs when somebody opens a page.
 */
export async function listChannelSummaries(merchantId: string): Promise<ChannelSummary[]> {
  const channels = await prisma.channel.findMany({
    where: { merchantId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      kind: true,
      isActive: true,
      cursor: true,
      lastSyncedAt: true,
    },
  });

  const [orderCounts, lastJobs] = await Promise.all([
    prisma.order.groupBy({ by: ['channelId'], where: { merchantId }, _count: { _all: true } }),
    Promise.all(
      channels.flatMap((channel) =>
        JOB_TYPES.map(async (type) => {
          const job = await prisma.syncJob.findFirst({
            where: { channelId: channel.id, type },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: jobSelect,
          });
          return { channelId: channel.id, type, job: job ? mapSyncJob(job) : null };
        }),
      ),
    ),
  ]);

  const ordersByChannel = new Map(orderCounts.map((row) => [row.channelId, row._count._all]));

  return channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    isActive: channel.isActive,
    connector: connectorState(channel.kind),
    cursor: channel.cursor,
    lastSyncedAt: channel.lastSyncedAt?.toISOString() ?? null,
    orderCount: ordersByChannel.get(channel.id) ?? 0,
    lastJobs: Object.fromEntries(
      JOB_TYPES.map((type) => [
        type,
        lastJobs.find((entry) => entry.channelId === channel.id && entry.type === type)?.job ?? null,
      ]),
    ) as ChannelSummary['lastJobs'],
  }));
}
