import { prisma } from '@/server/db';
import type { ChannelRef } from '@/lib/types';

/**
 * Channels as the rest of the app needs to refer to them: an id, a name and a
 * kind. Connecting, syncing and credentials arrive with milestone 4 — this is
 * the read the orders screens need to name a channel and fill their filter.
 */
export async function listChannels(merchantId: string): Promise<ChannelRef[]> {
  return prisma.channel.findMany({
    where: { merchantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true },
  });
}
