import { describe, expect, it } from 'vitest';
import {
  MAX_RETRIES,
  RETRY_BASE_MS,
  backoffMs,
  isRetryable,
  settledRefs,
} from '@/server/sync/retryable';
import { clearRefs, dueItems, enqueueFailures, queueState } from '@/server/sync/retry-queue';
import type { SyncFailure } from '@/lib/types';

/**
 * The retry policy, and the queue that carries it out.
 *
 * No Redis here: with `UPSTASH_REDIS_REST_URL` unset the queue runs on its
 * in-process fallback, which is the same code path a fresh clone gets. That is
 * the point of the fallback being real rather than a stub — the behaviour under
 * test is the behaviour that ships.
 *
 * Each test uses its own channel id, because the fallback's state is
 * module-level and shared, exactly as Redis would be.
 */

const failure = (ref: string, code: string): SyncFailure => ({ ref, code, message: `${code} on ${ref}` });

describe('isRetryable', () => {
  it('retries what we said, because our codes describe a moment', () => {
    // No answer or a 5xx, our limiter, our own bug.
    expect(isRetryable(failure('AUD-1', 'CHANNEL_ERROR'))).toBe(true);
    expect(isRetryable(failure('AUD-1', 'RATE_LIMITED'))).toBe(true);
    expect(isRetryable(failure('AUD-1', 'INTERNAL'))).toBe(true);
  });

  it('does not retry what the channel said about an item', () => {
    // These are verdicts. The same listing gets the same answer in four minutes,
    // and a queue full of them is a log nobody reads.
    expect(isRetryable(failure('KIT-1', 'CATEGORY_NOT_LISTED'))).toBe(false);
    expect(isRetryable(failure('AUD-1', 'PRICE_FORMAT'))).toBe(false);
    expect(isRetryable(failure('AUD-1', 'DUPLICATE_IN_BATCH'))).toBe(false);
    expect(isRetryable(failure('AUD-1', 'TOO_MANY_ITEMS'))).toBe(false);
  });
});

describe('settledRefs', () => {
  it('takes out what the channel accepted', () => {
    expect(settledRefs(['AUD-1', 'BAG-2'], [])).toEqual(['AUD-1', 'BAG-2']);
  });

  /**
   * The production bug this function was extracted for. An item that ran out of
   * request budget is queued as RATE_LIMITED without ever being sent; when the
   * retry finally sends it and the channel refuses it outright, "do not enqueue
   * it again" is not enough — it is already in the queue. Left there it came
   * back every run, spent a token to hear the same verdict, and never aged out,
   * because attempts are only counted for items worth retrying.
   */
  it('also takes out what the channel refused for good', () => {
    const settled = settledRefs(
      ['AUD-1'],
      [failure('KIT-9', 'CATEGORY_NOT_LISTED'), failure('PWR-3', 'CHANNEL_ERROR')],
    );

    expect(settled).toContain('AUD-1');
    expect(settled).toContain('KIT-9');
    // The retryable one stays in the queue; it is the whole reason there is one.
    expect(settled).not.toContain('PWR-3');
  });

  it('names each ref once, however many ways it was reported', () => {
    expect(settledRefs(['KIT-9'], [failure('KIT-9', 'CATEGORY_NOT_LISTED')])).toEqual(['KIT-9']);
  });
});

describe('backoffMs', () => {
  const noJitter = () => 0.5;

  it('doubles each attempt from the base delay', () => {
    const delays = [1, 2, 3, 4, 5].map((attempt) => backoffMs(attempt, noJitter));
    expect(delays).toEqual([
      RETRY_BASE_MS,
      RETRY_BASE_MS * 2,
      RETRY_BASE_MS * 4,
      RETRY_BASE_MS * 8,
      RETRY_BASE_MS * 16,
    ]);
  });

  it('spreads a batch that failed together over a ±20% window', () => {
    const lowest = backoffMs(1, () => 0);
    const highest = backoffMs(1, () => 0.999999);

    expect(lowest).toBe(RETRY_BASE_MS * 0.8);
    expect(highest).toBeLessThanOrEqual(RETRY_BASE_MS * 1.2);
    expect(highest).toBeGreaterThan(lowest);
  });

  it('stays ordered despite the jitter, so a later attempt waits longer', () => {
    // The worst case for ordering: the longest possible attempt N against the
    // shortest possible attempt N+1.
    expect(backoffMs(2, () => 0.999999)).toBeLessThan(backoffMs(3, () => 0));
  });
});

describe('the queue', () => {
  it('schedules only the retryable failures', async () => {
    const channel = 'ch-mixed';
    const outcome = await enqueueFailures(channel, [
      failure('AUD-1001-BLACK', 'CHANNEL_ERROR'),
      failure('KIT-1004-S', 'CATEGORY_NOT_LISTED'),
      failure('PWR-1006-5000MAH', 'RATE_LIMITED'),
    ]);

    expect(outcome.queued.sort()).toEqual(['AUD-1001-BLACK', 'PWR-1006-5000MAH']);
    expect(outcome.exhausted).toEqual([]);
    expect((await queueState(channel)).depth).toBe(2);
  });

  it('holds an item back until its backoff has elapsed', async () => {
    const channel = 'ch-timing';
    const at = Date.now();
    await enqueueFailures(channel, [failure('AUD-2001-SAND', 'CHANNEL_ERROR')], at);

    // The first delay is 15s ± jitter, so nothing is due immediately and
    // everything is due once the longest possible jittered delay has passed.
    expect(await dueItems(channel, 10, at)).toEqual([]);

    const due = await dueItems(channel, 10, at + RETRY_BASE_MS * 1.2);
    expect(due).toEqual([{ ref: 'AUD-2001-SAND', attempt: 1 }]);
  });

  it('counts attempts across runs and gives up after MAX_RETRIES', async () => {
    const channel = 'ch-exhaust';
    const ref = 'BAG-3001-24L';
    const attempts: number[] = [];

    // The original failure plus one per retry run, all of them failing.
    for (let run = 0; run <= MAX_RETRIES; run += 1) {
      const outcome = await enqueueFailures(channel, [failure(ref, 'CHANNEL_ERROR')]);
      if (outcome.exhausted.includes(ref)) break;
      attempts.push(run);
    }

    expect(attempts.length).toBe(MAX_RETRIES);

    // And it is gone: an abandoned item does not sit in the queue forever
    // being reported as work waiting to happen.
    expect(await queueState(channel)).toEqual({ depth: 0, nextDueAt: null });
  });

  it('forgets an item that finally succeeded, backoff and all', async () => {
    const channel = 'ch-cleared';
    const ref = 'DSK-4001-OAK';

    await enqueueFailures(channel, [failure(ref, 'CHANNEL_ERROR')]);
    await clearRefs(channel, [ref]);
    expect((await queueState(channel)).depth).toBe(0);

    // Failing again months later starts from the first delay, not from wherever
    // the old attempt count had got to.
    const at = Date.now();
    await enqueueFailures(channel, [failure(ref, 'CHANNEL_ERROR')], at);
    const due = await dueItems(channel, 10, at + RETRY_BASE_MS * 1.2);
    expect(due).toEqual([{ ref, attempt: 1 }]);
  });

  it('hands back the oldest items first, and no more than asked for', async () => {
    const channel = 'ch-order';
    const at = Date.now();

    // Enqueued at different times, so their due times are ordered too.
    await enqueueFailures(channel, [failure('AUD-5001-SLATE', 'CHANNEL_ERROR')], at);
    await enqueueFailures(channel, [failure('LGT-5002-2700K', 'CHANNEL_ERROR')], at + 5_000);
    await enqueueFailures(channel, [failure('PWR-5003-10000MAH', 'CHANNEL_ERROR')], at + 10_000);

    const due = await dueItems(channel, 2, at + RETRY_BASE_MS * 2);
    expect(due.length).toBe(2);
    expect(due[0].ref).toBe('AUD-5001-SLATE');

    expect((await queueState(channel)).depth).toBe(3);
  });

  it('reports an empty queue as empty rather than as unknown', async () => {
    expect(await queueState('ch-never-used')).toEqual({ depth: 0, nextDueAt: null });
    expect(await dueItems('ch-never-used', 10)).toEqual([]);
  });
});
