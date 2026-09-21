import type { Prisma } from '@/generated/prisma/client';
import { ProductStatus, SyncJobType } from '@/generated/prisma/enums';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/http/errors';
import type { CatalogItem, ChannelAdapter } from '@/server/channels/adapter';
import { adapterFor, connectorState } from '@/server/channels/registry';
import { variantIdsBySku, type IngestContext } from '@/server/orders/ingest';
import { readPages } from '@/server/orders/pull';
import { jobSelect, mapSyncJob, runJob } from '@/server/sync/runner';
import { listChannels } from '@/server/services/channels';
import type { SyncJobListQuery } from '@/lib/schemas/sync';
import type { SyncFailure, SyncJobItem, SyncJobsPage } from '@/lib/types';

/**
 * Catalog push, order pull, and reading back what happened.
 *
 * The service owns the decisions that are OrderHub's: which variants are worth
 * sending, how to split them, how far a single run may read, and what a run's
 * counts mean. The adapter owns the channel's dialect. Neither knows anything
 * about HTTP status codes.
 *
 * The two syncs count different things, and both counts are honest. A catalog
 * push counts listings, and `itemsOk + itemsFailed` is the catalog. An order
 * pull counts orders that landed — new ones and ones we already had, because
 * both mean the feed was read successfully — against orders that could not be
 * written and pages that could not be fetched.
 */

/**
 * What gets listed. Draft and archived products are not listings — pushing a
 * draft would publish something nobody has finished writing, and re-pushing an
 * archived one would resurrect it on the channel.
 */
async function catalogItems(merchantId: string): Promise<CatalogItem[]> {
  const variants = await prisma.variant.findMany({
    where: { product: { merchantId, status: ProductStatus.active } },
    orderBy: { sku: 'asc' },
    select: {
      id: true,
      sku: true,
      priceCents: true,
      currency: true,
      attributes: true,
      product: { select: { name: true } },
    },
  });

  return variants.map((variant) => ({
    variantId: variant.id,
    sku: variant.sku,
    title: variant.product.name,
    priceCents: variant.priceCents,
    currency: variant.currency,
    attributes: (variant.attributes ?? {}) as Record<string, string>,
  }));
}

/**
 * Send the catalog in the largest batches the channel admits, one after another.
 *
 * Sequentially, not in parallel: a marketplace that publishes a batch limit has
 * opinions about concurrency too, and the polite version is also the one that
 * milestone 6's token bucket can slow down without being rewritten.
 *
 * A batch that fails as a whole — the connection dropped, the key was rejected —
 * does not end the run. Its items are recorded as failed and the next batch is
 * attempted, because a batch endpoint failing once is not a promise that the
 * next call will fail, and abandoning the remaining items would leave them
 * neither pushed nor written down. The failures are recorded per item rather
 * than once per batch so that `itemsOk` and `itemsFailed` are both counts of
 * items — a job whose numbers do not add up to the catalog is a job nobody can
 * reason about, and milestone 6's retry queue needs the refs anyway.
 */
async function pushInBatches(adapter: ChannelAdapter, items: CatalogItem[]) {
  const failures: SyncFailure[] = [];
  let itemsOk = 0;

  for (let start = 0; start < items.length; start += adapter.batchLimit) {
    const batch = items.slice(start, start + adapter.batchLimit);
    try {
      const result = await adapter.pushCatalog(batch);
      itemsOk += result.ok.length;
      failures.push(...result.failed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'the channel could not be reached';
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      if (!(error instanceof AppError)) console.error('[sync:catalog]', error);
      failures.push(...batch.map((item) => ({ ref: item.sku, code, message })));
    }
  }

  return { itemsOk, failures };
}

/**
 * The channel a sync was asked for, and the connector that speaks to it — or the
 * reason there is not going to be a job at all. Both kinds of sync ask the same
 * four questions, and a second copy of them would be a second chance to phrase
 * the refusal differently.
 */
async function syncableChannel(merchantId: string, channelId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, merchantId },
    select: { id: true, name: true, kind: true, credentials: true, isActive: true, cursor: true },
  });
  if (!channel) throw notFound('Channel');

  if (!channel.isActive) {
    throw new AppError('CONFLICT', `${channel.name} is disconnected — reconnect it before syncing.`);
  }

  const adapter = adapterFor(channel);
  if (!adapter) {
    // Not an error in the channel — an error in asking. Which of the two reasons
    // it is matters to whoever asked: one of them will never change.
    throw new AppError(
      'CONFLICT',
      connectorState(channel.kind) === 'none'
        ? `${channel.name} has no connector — its orders originate here.`
        : `${channel.name} has no connector yet.`,
    );
  }

  return { channel, adapter };
}

export async function pushCatalog(merchantId: string, channelId: string): Promise<SyncJobItem> {
  const { channel, adapter } = await syncableChannel(merchantId, channelId);

  const items = await catalogItems(merchantId);
  return runJob(channel.id, SyncJobType.catalog_push, () => pushInBatches(adapter, items));
}

/**
 * Read as much of the channel's order feed as one run is allowed to.
 *
 * The service's share of the work is small on purpose: it decides which channel,
 * builds the SKU index, and owns the one write that may move the cursor. How the
 * pages are walked and when the cursor may move is `src/server/orders/pull.ts`,
 * because that is the part worth testing and the part a database would make
 * awkward to test.
 *
 * `lastSyncedAt` is updated even when a page was empty: "we looked and there was
 * nothing" is a different fact from "we have not looked since Tuesday", and the
 * Channels screen shows it.
 */
export async function pullOrders(merchantId: string, channelId: string): Promise<SyncJobItem> {
  const { channel, adapter } = await syncableChannel(merchantId, channelId);

  const context: IngestContext = {
    merchantId,
    channelId: channel.id,
    actor: `channel:${channel.kind}`,
    variantIdBySku: await variantIdsBySku(prisma, merchantId),
  };

  return runJob(channel.id, SyncJobType.order_pull, async () => {
    const outcome = await readPages({
      adapter,
      db: prisma,
      context,
      cursor: channel.cursor ?? undefined,
      onPageCommitted: async (next) => {
        await prisma.channel.update({
          where: { id: channel.id },
          data: { lastSyncedAt: new Date(), ...(next ? { cursor: next } : {}) },
        });
      },
    });

    return { itemsOk: outcome.itemsOk, failures: outcome.failures };
  });
}

export async function listSyncJobs(
  merchantId: string,
  input: SyncJobListQuery,
): Promise<SyncJobsPage> {
  // Scoped through the channel rather than by a merchantId on the job: SyncJob
  // has no merchant column, and adding one to save a join would be a second
  // place for the two to disagree.
  const where: Prisma.SyncJobWhereInput = {
    channel: { merchantId },
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
  };

  const [total, jobs, channels] = await Promise.all([
    prisma.syncJob.count({ where }),
    prisma.syncJob.findMany({
      where,
      // Jobs written by the seed share a createdAt down to the second, so the id
      // breaks the tie and a row cannot appear on two pages.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: jobSelect,
    }),
    listChannels(merchantId),
  ]);

  return {
    data: jobs.map(mapSyncJob),
    channels,
    page: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}
