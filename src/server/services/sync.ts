import type { Prisma } from '@/generated/prisma/client';
import { ProductStatus, SyncJobType } from '@/generated/prisma/enums';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/http/errors';
import type { CatalogItem, ChannelAdapter } from '@/server/channels/adapter';
import { adapterFor, connectorState } from '@/server/channels/registry';
import { variantIdsBySku, type IngestContext } from '@/server/orders/ingest';
import { readPages } from '@/server/orders/pull';
import { jobSelect, mapSyncJob, runJob } from '@/server/sync/runner';
import { clearRefs, dueItems, enqueueFailures, queueState } from '@/server/sync/retry-queue';
import { settledRefs } from '@/server/sync/retryable';
import { listChannels } from '@/server/services/channels';
import { invalidateDashboard } from '@/server/services/dashboard';
import type { SyncJobListQuery } from '@/lib/schemas/sync';
import type { RetryRunResult, SyncFailure, SyncJobItem, SyncJobsPage } from '@/lib/types';

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
 *
 * `skus` narrows the read to the items a retry run is carrying. The queue holds
 * references, so this is where a retried item gets its current title and its
 * current price — a SKU archived since it failed simply does not come back, and
 * the caller drops it from the queue instead of pushing a listing the merchant
 * has withdrawn.
 */
async function catalogItems(merchantId: string, skus?: readonly string[]): Promise<CatalogItem[]> {
  const variants = await prisma.variant.findMany({
    where: {
      product: { merchantId, status: ProductStatus.active },
      ...(skus ? { sku: { in: [...skus] } } : {}),
    },
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
type BatchOutcome = {
  itemsOk: number;
  /** The refs the channel accepted, so the queue can forget them. */
  okRefs: string[];
  failures: SyncFailure[];
};

async function pushInBatches(adapter: ChannelAdapter, items: CatalogItem[]): Promise<BatchOutcome> {
  const failures: SyncFailure[] = [];
  const okRefs: string[] = [];

  for (let start = 0; start < items.length; start += adapter.batchLimit) {
    const batch = items.slice(start, start + adapter.batchLimit);
    try {
      const result = await adapter.pushCatalog(batch);
      okRefs.push(...result.ok);
      failures.push(...result.failed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'the channel could not be reached';
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      if (!(error instanceof AppError)) console.error('[sync:catalog]', error);
      failures.push(...batch.map((item) => ({ ref: item.sku, code, message })));

      // Out of request budget. Unlike a 5xx — which says nothing about the next
      // call — this says the next call will be refused too, so the run stops and
      // the items it never sent are recorded as exactly that. They are not
      // failures of the channel's; they are work this run did not get to, and
      // the queue is where work goes to be got to later.
      if (error instanceof AppError && error.code === 'RATE_LIMITED') {
        const unsent = items.slice(start + adapter.batchLimit);
        failures.push(
          ...unsent.map((item) => ({
            ref: item.sku,
            code: 'RATE_LIMITED',
            message: 'Not sent — this channel had no request budget left in this run.',
          })),
        );
        break;
      }
    }
  }

  return { itemsOk: okRefs.length, okRefs, failures };
}

/**
 * What happens to a catalog run's results once the pushing is over: the queue
 * forgets what landed, remembers what is worth another go, and the job's own
 * error list says which is which.
 *
 * Annotating the messages rather than adding rows keeps `itemsOk + itemsFailed`
 * equal to the number of items pushed — the sync log's counts stay counts of
 * items — while still telling whoever reads the log whether a given failure is
 * coming back on its own or waiting for a human.
 */
async function settleCatalog(channelId: string, outcome: BatchOutcome) {
  // Everything the channel has ruled on leaves the queue — accepted or refused
  // for good. The rule itself lives in retryable.ts, where it is tested.
  await clearRefs(channelId, settledRefs(outcome.okRefs, outcome.failures));

  const { queued, exhausted } = await enqueueFailures(channelId, outcome.failures);

  const isQueued = new Set(queued);
  const isExhausted = new Set(exhausted);

  return {
    itemsOk: outcome.itemsOk,
    failures: outcome.failures.map((failure) => {
      if (isQueued.has(failure.ref)) {
        return { ...failure, message: `${failure.message} Queued for retry.` };
      }
      if (isExhausted.has(failure.ref)) {
        return { ...failure, message: `${failure.message} Retries exhausted — giving up.` };
      }
      return failure;
    }),
  };
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
  const job = await runJob(channel.id, SyncJobType.catalog_push, async () =>
    settleCatalog(channel.id, await pushInBatches(adapter, items)),
  );

  // The overview shows last-sync and recent-failure lines, and both just moved.
  await invalidateDashboard(merchantId);
  return job;
}

/**
 * Push the items the queue says are due, and nothing else.
 *
 * This is the half of the design that makes the queue worth having. A full
 * catalog push would cover the failed items too — it sends everything — but it
 * would spend the channel's entire request budget re-listing ninety items to
 * fix three, and against a marketplace that allows ten calls a minute that is
 * the difference between a retry and an outage of one's own making.
 *
 * There is no worker in this demo, so "due" is evaluated when somebody asks:
 * the button on the Channels screen, or in a real deployment a cron hitting the
 * same endpoint every minute. The queue does not care which; it only knows what
 * is due and how many times each item has failed.
 */
export async function runCatalogRetries(
  merchantId: string,
  channelId: string,
): Promise<RetryRunResult> {
  const { channel, adapter } = await syncableChannel(merchantId, channelId);

  // Two batches' worth: enough for a retry to make visible progress, bounded so
  // that draining the queue cannot itself become the thing that exhausts the
  // budget a normal sync needs.
  const due = await dueItems(channel.id, adapter.batchLimit * 2);
  if (due.length === 0) {
    const queue = await queueState(channel.id);
    return {
      job: null,
      queue,
      note:
        queue.depth === 0
          ? 'Nothing is waiting to be retried.'
          : `${queue.depth} item${queue.depth === 1 ? '' : 's'} queued, none due yet.`,
    };
  }

  const items = await catalogItems(
    merchantId,
    due.map((item) => item.ref),
  );

  // A SKU that has been archived or deleted since it failed is not a failure to
  // retry — it is a listing the merchant withdrew. It leaves the queue quietly.
  const present = new Set(items.map((item) => item.sku));
  const withdrawn = due.filter((item) => !present.has(item.ref)).map((item) => item.ref);
  await clearRefs(channel.id, withdrawn);

  if (items.length === 0) {
    return {
      job: null,
      queue: await queueState(channel.id),
      note: `${withdrawn.length} queued item${withdrawn.length === 1 ? ' is' : 's are'} no longer in the catalog; dropped.`,
    };
  }

  // `attempt` on the queue is how many times an item has failed, so the run
  // about to happen is one more than the worst of them.
  const attempt = 1 + Math.max(...due.map((item) => item.attempt));

  const job = await runJob(
    channel.id,
    SyncJobType.catalog_push,
    async () => settleCatalog(channel.id, await pushInBatches(adapter, items)),
    { attempt },
  );

  await invalidateDashboard(merchantId);

  return {
    job,
    queue: await queueState(channel.id),
    note: `Attempt ${attempt} for ${items.length} item${items.length === 1 ? '' : 's'}.`,
  };
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

  const job = await runJob(channel.id, SyncJobType.order_pull, async () => {
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

  // New orders change today's count and the status breakdown, and the run
  // itself changes the last-sync line.
  await invalidateDashboard(merchantId);
  return job;
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
