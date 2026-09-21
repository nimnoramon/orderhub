/**
 * The token bucket itself: arithmetic, and nothing else.
 *
 * A bucket holds `capacity` tokens and refills at a steady rate. A request
 * spends one. If there is none to spend, the bucket says how long until there
 * is. That is the entire algorithm, and keeping it in a pure function is what
 * lets `tests/token-bucket.test.ts` assert the part that has to be right without
 * a Redis, a clock or a channel anywhere near it.
 *
 * Why a bucket and not a counter per window: a fixed window lets a caller spend
 * its whole allowance in the last second of one window and the whole of the next
 * in the first second of the following one — twice the rate, briefly, which is
 * exactly when a marketplace notices. A bucket smooths that out by construction.
 *
 * ## Choosing the numbers against a fixed window
 *
 * MockShop B counts ten requests per fixed minute. A bucket that both starts
 * full and refills inside that same minute can spend `capacity + refill` in one
 * window, so the safe rule is:
 *
 *     capacity + refillPerMinute <= the channel's documented limit
 *
 * B's connector uses 6 + 4, which can never put more than ten requests into any
 * sixty-second span. The cost of that arithmetic is that a full catalog push
 * does not fit in one run — which is what the retry queue is for.
 */

export type Rate = {
  /** The burst: how many requests may go out back to back from a full bucket. */
  capacity: number;
  /** The steady rate, in tokens per minute. */
  refillPerMinute: number;
};

export type BucketState = { tokens: number; updatedAt: number };

export type TakeResult = {
  ok: boolean;
  /** Tokens left after the attempt, whether or not it succeeded. */
  tokens: number;
  /** Milliseconds until the next token, or 0 when one was available. */
  waitMs: number;
  state: BucketState;
};

const perMs = (rate: Rate): number => rate.refillPerMinute / 60_000;

/**
 * How long a bucket key is worth keeping: the time it takes to refill from
 * empty. After that an absent key and a stored key say the same thing — full —
 * and letting Redis forget it is cheaper than storing it.
 */
export const bucketTtlMs = (rate: Rate): number =>
  Math.ceil(rate.capacity / perMs(rate)) + 60_000;

/**
 * A bucket nobody has touched is full, not empty. Starting a new channel at zero
 * would rate-limit its very first request, which is the wrong answer to "we have
 * never spoken to this marketplace before".
 */
export const fullBucket = (rate: Rate, now: number): BucketState => ({
  tokens: rate.capacity,
  updatedAt: now,
});

/** Add whatever time has passed, never above the capacity. */
export function refill(state: BucketState, rate: Rate, now: number): BucketState {
  const elapsed = Math.max(0, now - state.updatedAt);
  return {
    tokens: Math.min(rate.capacity, state.tokens + elapsed * perMs(rate)),
    updatedAt: now,
  };
}

/**
 * Spend a token, or report how long until one exists.
 *
 * `waitMs` is the caller's whole decision: the limiter waits it out if it is
 * short and gives up if it is not. Returning the number rather than sleeping
 * here is what keeps this function pure and the policy somewhere it can be read.
 */
export function take(
  previous: BucketState | null,
  rate: Rate,
  now: number,
  cost = 1,
): TakeResult {
  const state = refill(previous ?? fullBucket(rate, now), rate, now);

  if (state.tokens >= cost) {
    const after = { tokens: state.tokens - cost, updatedAt: now };
    return { ok: true, tokens: after.tokens, waitMs: 0, state: after };
  }

  return {
    ok: false,
    tokens: state.tokens,
    waitMs: Math.ceil((cost - state.tokens) / perMs(rate)),
    state,
  };
}

/**
 * The same algorithm, for Redis to run.
 *
 * It exists because taking a token is read-modify-write, and two syncs on two
 * instances that both read four tokens and both write three have between them
 * spent one. Lua runs on the server, atomically, which is the only way to make
 * the bucket mean anything across instances.
 *
 * Two copies of one algorithm is a real cost and worth naming: the TypeScript
 * above is the one under test, this is the one that runs in production, and they
 * are written next to each other so a change to either is obviously a change to
 * both. The alternative — WATCH/MULTI round trips over HTTP — is slower and more
 * code, for a function that has to be fast because it runs before every call.
 *
 * `now` is passed in rather than read from Redis TIME: the fallback path has no
 * Redis to ask, and the two implementations must agree. Clock skew between
 * instances is then the assumption, which on a managed platform is small
 * compared to a bucket measured in seconds.
 *
 * Returns { allowed, tokens, waitMs }. Tokens come back as a string because Lua
 * returns integers to Redis and the count is fractional.
 */
export const TAKE_SCRIPT = `
local capacity = tonumber(ARGV[1])
local per_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local stored = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(stored[1])
local ts = tonumber(stored[2])

if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end

local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * per_ms)

local allowed = 0
local wait = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  wait = math.ceil((cost - tokens) / per_ms)
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], ttl)

return { allowed, tostring(tokens), wait }
`;
