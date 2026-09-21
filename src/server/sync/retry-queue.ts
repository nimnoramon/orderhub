import { redis, tolerant } from '@/server/redis/client';
import { memoryQueue } from '@/server/redis/memory';
import { retryQueueKey, retryTriesKey } from '@/server/redis/keys';
import type { RetryQueueState, SyncFailure } from '@/lib/types';
import { MAX_RETRIES, backoffMs, isRetryable } from './retryable';

/**
 * The catalog items that did not make it, and when to try them again.
 *
 * Two structures, both keyed by channel: a sorted set of `sku -> due time`, and
 * a hash of `sku -> attempts so far`. Reading the queue is then "everything
 * scored below now", which is one command rather than a scan, and the schedule
 * survives the process that wrote it.
 *
 * ## The queue holds references, not payloads
 *
 * A queued entry is a SKU. When the retry runs, the variant is read from
 * Postgres again — its current title, its current price. Enqueuing the item
 * itself would be faster and would be wrong: the copy in Redis is a snapshot of
 * what the catalog looked like when the push failed, and pushing a four-minute-old
 * price to a marketplace because that is what the queue happened to be holding
 * is a bug that looks like a caching decision. Redis owns the schedule;
 * Postgres owns the truth.
 *
 * ## Why not a `RetryItem` table
 *
 * It would work, and it would be one more table to migrate, index and clean up
 * for data whose whole life is measured in minutes and whose loss costs a
 * re-push. A queue is the shape of the problem, and Redis has one.
 */

export type QueuedItem = {
  ref: string;
  /** How many times this item has already failed. 1 after the first failure. */
  attempt: number;
};

export type EnqueueOutcome = {
  /** Refs that will be tried again. */
  queued: string[];
  /** Refs that have now failed MAX_RETRIES times and were dropped. */
  exhausted: string[];
};

export const EMPTY_QUEUE: RetryQueueState = { depth: 0, nextDueAt: null };

/**
 * Record a run's failures and schedule the ones worth repeating.
 *
 * Permanent failures never enter the queue at all — they are already in the
 * job's `errorSummary`, where a human can read them, which is the only place a
 * verdict belongs.
 */
export async function enqueueFailures(
  channelId: string,
  failures: readonly SyncFailure[],
  now = Date.now(),
): Promise<EnqueueOutcome> {
  const refs = [...new Set(failures.filter(isRetryable).map((failure) => failure.ref))];
  if (refs.length === 0) return { queued: [], exhausted: [] };

  const queueKey = retryQueueKey(channelId);
  const triesKey = retryTriesKey(channelId);
  const queued: string[] = [];
  const exhausted: string[] = [];

  const client = redis();
  if (!client) {
    const queue = memoryQueue(queueKey);
    for (const ref of refs) {
      const attempt = (queue.get(ref)?.attempt ?? 0) + 1;
      if (attempt > MAX_RETRIES) {
        queue.delete(ref);
        exhausted.push(ref);
      } else {
        queue.set(ref, { dueAt: now + backoffMs(attempt), attempt });
        queued.push(ref);
      }
    }
    return { queued, exhausted };
  }

  return tolerant(
    `enqueue ${queueKey}`,
    async () => {
      // Two round trips rather than two per item: count the attempts, then
      // schedule or drop each ref according to what the counter came back as.
      const counts = client.pipeline();
      for (const ref of refs) counts.hincrby(triesKey, ref, 1);
      const attempts = (await counts.exec()) as number[];

      const writes = client.pipeline();
      refs.forEach((ref, index) => {
        const attempt = attempts[index] ?? 1;
        if (attempt > MAX_RETRIES) {
          writes.zrem(queueKey, ref);
          writes.hdel(triesKey, ref);
          exhausted.push(ref);
        } else {
          writes.zadd(queueKey, { score: now + backoffMs(attempt), member: ref });
          queued.push(ref);
        }
      });
      await writes.exec();

      return { queued, exhausted };
    },
    // A queue that could not be written is a queue this run does not have. The
    // failures are still in the job's errorSummary, and the next full catalog
    // push covers the same items anyway.
    { queued: [], exhausted: [] },
  );
}

/** Items due now, oldest first, capped at what one run may send. */
export async function dueItems(
  channelId: string,
  limit: number,
  now = Date.now(),
): Promise<QueuedItem[]> {
  const queueKey = retryQueueKey(channelId);
  const triesKey = retryTriesKey(channelId);

  const client = redis();
  if (!client) {
    return [...memoryQueue(queueKey).entries()]
      .filter(([, entry]) => entry.dueAt <= now)
      .sort((a, b) => a[1].dueAt - b[1].dueAt)
      .slice(0, limit)
      .map(([ref, entry]) => ({ ref, attempt: entry.attempt }));
  }

  return tolerant(
    `due ${queueKey}`,
    async () => {
      const refs = await client.zrange<string[]>(queueKey, 0, now, {
        byScore: true,
        offset: 0,
        count: limit,
      });
      if (refs.length === 0) return [];

      const tries = await client.hmget<Record<string, number>>(triesKey, ...refs);
      return refs.map((ref) => ({ ref, attempt: Number(tries?.[ref] ?? 1) }));
    },
    [],
  );
}

/**
 * Take items out of the queue because they no longer need to be in it — they
 * were pushed successfully, or the catalog no longer has them. Both the
 * schedule and the attempt count go, so a SKU that fails again months later
 * starts its backoff from the beginning rather than from wherever it left off.
 */
export async function clearRefs(channelId: string, refs: readonly string[]): Promise<void> {
  if (refs.length === 0) return;

  const queueKey = retryQueueKey(channelId);
  const triesKey = retryTriesKey(channelId);

  const client = redis();
  if (!client) {
    const queue = memoryQueue(queueKey);
    for (const ref of refs) queue.delete(ref);
    return;
  }

  await tolerant(
    `clear ${queueKey}`,
    async () => {
      const writes = client.pipeline();
      writes.zrem(queueKey, ...refs);
      writes.hdel(triesKey, ...refs);
      await writes.exec();
      return null;
    },
    null,
  );
}

/** What the Channels screen shows: how much is waiting, and when it wakes up. */
export async function queueState(channelId: string): Promise<RetryQueueState> {
  const queueKey = retryQueueKey(channelId);

  const client = redis();
  if (!client) {
    const entries = [...memoryQueue(queueKey).values()];
    if (entries.length === 0) return EMPTY_QUEUE;
    const soonest = Math.min(...entries.map((entry) => entry.dueAt));
    return { depth: entries.length, nextDueAt: new Date(soonest).toISOString() };
  }

  return tolerant(
    `state ${queueKey}`,
    async () => {
      const [depth, head] = await Promise.all([
        client.zcard(queueKey),
        client.zrange<(string | number)[]>(queueKey, 0, 0, { withScores: true }),
      ]);
      if (depth === 0) return EMPTY_QUEUE;

      const score = Number(head?.[1]);
      return {
        depth,
        nextDueAt: Number.isFinite(score) ? new Date(score).toISOString() : null,
      };
    },
    EMPTY_QUEUE,
  );
}
