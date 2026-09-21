import { AppError } from '@/server/http/errors';
import { redis, tolerant } from '@/server/redis/client';
import { memoryBuckets } from '@/server/redis/memory';
import { bucketKey, loginKey } from '@/server/redis/keys';
import type { LimiterState } from '@/lib/types';
import {
  TAKE_SCRIPT,
  bucketTtlMs,
  fullBucket,
  refill,
  take,
  type BucketState,
  type Rate,
  type TakeResult,
} from './token-bucket';

/**
 * The limiter a connector spends a token on before every request it sends.
 *
 * Keyed on the channel *row*, not on the kind: two MockShop B accounts are two
 * clients as far as the marketplace's counter is concerned, and sharing one
 * bucket between them would throttle a merchant for someone else's traffic. It
 * is the same reasoning that gives each channel its own adapter instance.
 *
 * The connector never sees any of this. It is handed something with `acquire()`
 * on it, which is all an adapter should know about rate limiting — the Redis
 * call, the Lua and the waiting policy stay on this side of that seam, and the
 * adapter stays testable with no infrastructure behind it.
 */

/**
 * How long a call may sit waiting for a token.
 *
 * Short, because this runs inside the request a human is waiting on. Waiting is
 * worth it when the next token is closer than the request itself would take —
 * two calls landing together, which is the case a bucket exists to smooth. When
 * the wait is longer than this the run gives up and says so, and for a catalog
 * push that means the rest of the items go to the retry queue rather than a
 * visitor watching a spinner for forty seconds.
 */
const MAX_WAIT_MS = 2_000;

/** One retry after a wait: the token we waited for may have gone to somebody else. */
const MAX_ATTEMPTS = 2;

export interface Limiter {
  /** Spend a token, waiting briefly if one is nearly due. Throws RATE_LIMITED. */
  acquire(): Promise<void>;
  /** Look without spending — for screens, never for a decision. */
  peek(): Promise<LimiterState | null>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse what the Lua script returns: [allowed, tokens as string, waitMs]. */
function fromScript(reply: unknown, rate: Rate, now: number): TakeResult {
  const [allowed, tokens, waitMs] = reply as [number, string, number];
  const state = { tokens: Number(tokens), updatedAt: now };
  return { ok: allowed === 1, tokens: state.tokens, waitMs: Number(waitMs), state };
}

async function takeToken(key: string, rate: Rate, now: number): Promise<TakeResult> {
  const client = redis();

  if (!client) {
    const result = take(memoryBuckets.get(key, now), rate, now);
    memoryBuckets.set(key, result.state, bucketTtlMs(rate), now);
    return result;
  }

  return tolerant(
    `take ${key}`,
    async () =>
      fromScript(
        await client.eval(
          TAKE_SCRIPT,
          [key],
          [rate.capacity, rate.refillPerMinute / 60_000, now, 1, bucketTtlMs(rate)],
        ),
        rate,
        now,
      ),
    // Fail open. A limiter that cannot reach Redis has two options: block every
    // outbound call, or let them through and risk a 429 the channel will tell us
    // about anyway. The 429 path is already built — it ends as a `partial` job
    // with the items queued — and a Redis outage stopping all syncing is the
    // worse of the two failures by a distance.
    { ok: true, tokens: 0, waitMs: 0, state: fullBucket(rate, now) },
  );
}

async function readBucket(key: string, rate: Rate, now: number): Promise<BucketState> {
  const client = redis();
  if (!client) return refill(memoryBuckets.get(key, now) ?? fullBucket(rate, now), rate, now);

  const stored = await tolerant<Record<string, string> | null>(
    `peek ${key}`,
    () => client.hgetall<Record<string, string>>(key),
    null,
  );

  const tokens = Number(stored?.tokens);
  const updatedAt = Number(stored?.ts);
  if (!Number.isFinite(tokens) || !Number.isFinite(updatedAt)) return fullBucket(rate, now);

  return refill({ tokens, updatedAt }, rate, now);
}

/**
 * What to throw when the bucket is empty. It is a parameter because the two
 * things this limiter paces fail for different readers: a refused sync is a
 * sentence the sync log will keep, and a refused sign-in is a sentence a person
 * reads under a form. Same arithmetic, same Redis call, different apology.
 */
type Refusal = (waitMs: number, rate: Rate) => AppError;

function limiterFor(key: string, rate: Rate, refuse: Refusal): Limiter {
  return {
    async acquire(): Promise<void> {
      for (let attempt = 1; ; attempt += 1) {
        const result = await takeToken(key, rate, Date.now());
        if (result.ok) return;

        if (result.waitMs > MAX_WAIT_MS || attempt >= MAX_ATTEMPTS) {
          throw refuse(result.waitMs, rate);
        }

        await sleep(result.waitMs);
      }
    },

    async peek(): Promise<LimiterState> {
      const now = Date.now();
      const state = await readBucket(key, rate, now);
      const perMs = rate.refillPerMinute / 60_000;

      return {
        capacity: rate.capacity,
        remaining: Math.floor(state.tokens),
        nextTokenInMs:
          state.tokens >= rate.capacity ? 0 : Math.ceil((Math.floor(state.tokens) + 1 - state.tokens) / perMs),
      };
    },
  };
}

export function channelLimiter(channelId: string, rate: Rate): Limiter {
  return limiterFor(
    bucketKey(channelId),
    rate,
    // Not a channel failure — the channel has not been asked. Saying
    // RATE_LIMITED rather than CHANNEL_ERROR is what lets the sync log
    // distinguish "we paced ourselves" from "the marketplace is down", and what
    // tells the retry queue this item is worth another go.
    (waitMs) =>
      new AppError(
        'RATE_LIMITED',
        `This channel's request budget is spent; the next token is ${Math.ceil(waitMs / 1000)}s away.`,
        { waitMs, capacity: rate.capacity },
      ),
  );
}

/**
 * Five attempts, refilling five a minute, per address and client.
 *
 * Small enough to be worth having and large enough that a person who typed
 * their password wrong twice is not locked out of a demo. It is the same bucket
 * the marketplaces are paced with, which is the point: a limiter built around
 * one caller would have had to be written a second time for this.
 */
export const LOGIN_RATE: Rate = { capacity: 5, refillPerMinute: 5 };

export function loginLimiter(identity: string): Limiter {
  return limiterFor(
    loginKey(identity),
    LOGIN_RATE,
    (waitMs) =>
      new AppError(
        'RATE_LIMITED',
        `Too many sign-in attempts. Try again in ${Math.ceil(waitMs / 1000)}s.`,
      ),
  );
}

/**
 * For a channel that publishes no limit and for tests. It is a real Limiter
 * rather than an optional dependency so no call site has to ask whether it has
 * one before every request.
 */
export const UNLIMITED: Limiter = {
  async acquire() {},
  async peek() {
    return null;
  },
};
