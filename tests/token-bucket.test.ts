import { describe, expect, it } from 'vitest';
import {
  bucketTtlMs,
  fullBucket,
  refill,
  take,
  type BucketState,
  type Rate,
} from '@/server/ratelimit/token-bucket';
import { MOCK_B_RATE } from '@/server/channels/mock-b';
import { MOCK_A_RATE } from '@/server/channels/mock-a';

/**
 * The limiter's arithmetic, with no Redis and no clock.
 *
 * The last test is the one that matters: it is the claim the whole milestone
 * rests on — that these numbers cannot put more requests into a minute than
 * MockShop B allows in one. The rest establish that the bucket behaves like a
 * bucket, which is what makes that simulation believable.
 */

const RATE: Rate = { capacity: 6, refillPerMinute: 4 };
const MINUTE = 60_000;
const T0 = 1_760_000_000_000;

describe('refill', () => {
  it('adds tokens in proportion to the time that has passed', () => {
    // 4 per minute is one every 15 seconds.
    const state = refill({ tokens: 0, updatedAt: T0 }, RATE, T0 + 30_000);
    expect(state.tokens).toBeCloseTo(2, 10);
  });

  it('never goes above the capacity, however long the channel was idle', () => {
    const state = refill({ tokens: 0, updatedAt: T0 }, RATE, T0 + 24 * 3_600_000);
    expect(state.tokens).toBe(RATE.capacity);
  });

  it('ignores time running backwards rather than removing tokens', () => {
    // Two serverless instances, two slightly different clocks. A bucket that
    // subtracted tokens for a timestamp in the past would rate-limit a channel
    // because of clock skew.
    const state = refill({ tokens: 3, updatedAt: T0 }, RATE, T0 - 10_000);
    expect(state.tokens).toBe(3);
  });
});

describe('take', () => {
  it('starts full: a channel we have never called is not out of budget', () => {
    const result = take(null, RATE, T0);
    expect(result.ok).toBe(true);
    expect(result.tokens).toBe(RATE.capacity - 1);
  });

  it('spends one token per call until the bucket is empty', () => {
    let state: BucketState | null = null;
    const allowed: boolean[] = [];

    // Seven calls in the same millisecond against a capacity of six.
    for (let call = 0; call < 7; call += 1) {
      const result = take(state, RATE, T0);
      allowed.push(result.ok);
      state = result.state;
    }

    expect(allowed).toEqual([true, true, true, true, true, true, false]);
  });

  it('reports how long until the next token, and is right about it', () => {
    const empty: BucketState = { tokens: 0, updatedAt: T0 };

    const refused = take(empty, RATE, T0);
    expect(refused.ok).toBe(false);
    expect(refused.waitMs).toBe(15_000);

    // Waiting exactly that long is enough, and not a millisecond more.
    expect(take(empty, RATE, T0 + refused.waitMs - 1).ok).toBe(false);
    expect(take(empty, RATE, T0 + refused.waitMs).ok).toBe(true);
  });

  it('counts a partial token towards the wait', () => {
    // Half a token in hand means half an interval to wait, not a whole one.
    const result = take({ tokens: 0.5, updatedAt: T0 }, RATE, T0);
    expect(result.ok).toBe(false);
    expect(result.waitMs).toBe(7_500);
  });
});

describe('bucketTtlMs', () => {
  it('outlives a refill from empty, so a key never expires mid-recovery', () => {
    const fromEmptyMs = (RATE.capacity / RATE.refillPerMinute) * MINUTE;
    expect(bucketTtlMs(RATE)).toBeGreaterThan(fromEmptyMs);
  });

  it('treats a forgotten key as a full bucket, which is what an idle one is', () => {
    expect(fullBucket(RATE, T0).tokens).toBe(RATE.capacity);
  });
});

/**
 * MockShop B counts ten requests per fixed minute. Our bucket refills smoothly,
 * so the two disagree about what a minute is — and the only way a smooth bucket
 * stays inside a fixed window is `capacity + refillPerMinute <= limit`.
 *
 * Rather than assert that inequality, this drives the real `take` as fast as it
 * will allow for two hours of simulated time and checks every sixty-second span
 * along the way. If anyone ever "tunes" the numbers to make a catalog push
 * finish in one click, this is the test that says what it cost.
 */
describe('the numbers MockShop B is called with', () => {
  const LIMIT_PER_MINUTE = 10;
  const TICK_MS = 250;

  function sendTimes(rate: Rate, durationMs: number): number[] {
    const sent: number[] = [];
    let state: BucketState | null = null;

    for (let now = T0; now <= T0 + durationMs; now += TICK_MS) {
      // Always asking is the worst case: a caller with infinite work to do.
      const result = take(state, rate, now);
      state = result.state;
      if (result.ok) sent.push(now);
    }

    return sent;
  }

  it('cannot exceed ten requests in any sixty-second window', () => {
    const sent = sendTimes(MOCK_B_RATE, 2 * 3_600_000);

    let worst = 0;
    for (let start = 0; start < sent.length; start += 1) {
      const inWindow = sent.filter((at) => at >= sent[start] && at < sent[start] + MINUTE).length;
      worst = Math.max(worst, inWindow);
    }

    expect(worst).toBeLessThanOrEqual(LIMIT_PER_MINUTE);

    // And not so cautious that the budget goes unused. The busiest window holds
    // nine rather than ten because a burst takes six ticks to spend and the
    // tenth token falls just outside the minute that started with the first of
    // them — headroom that comes from the simulation's granularity, not from the
    // rate. Anything below this would mean the channel is being throttled harder
    // than it asked for.
    expect(worst).toBeGreaterThanOrEqual(LIMIT_PER_MINUTE - 1);
  });

  it('leaves a whole order pull inside the burst', () => {
    // Three pages, plus the transport's two retries when B throws a 500.
    expect(MOCK_B_RATE.capacity).toBeGreaterThanOrEqual(5);
  });

  it('never shapes MockShop A, which publishes no limit', () => {
    // A courtesy cap only has to be above anything a run actually does: a
    // catalog push to A is 50 items a batch, so one or two calls.
    const sent = sendTimes(MOCK_A_RATE, MINUTE);
    expect(sent.length).toBeGreaterThan(MOCK_B_RATE.capacity + MOCK_B_RATE.refillPerMinute);
  });
});
