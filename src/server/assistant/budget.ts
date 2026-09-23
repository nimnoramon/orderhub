import { AppError } from '@/server/http/errors';
import { redis } from '@/server/redis/client';
import { askDayKey } from '@/server/redis/keys';
import { memoryCounters } from '@/server/redis/memory';
import { endOfUtcDayExclusive, utcDay } from '@/lib/dates';

/**
 * How many questions this deployment will answer in a UTC day, across everyone.
 *
 * The per-person bucket in `src/server/ratelimit/limiter.ts` stops one visitor
 * from running up a bill. This stops *everyone* from doing it — a link that
 * lands on Hacker News is not an abuser, and the token bucket would happily let
 * two hundred people ask five questions each. A portfolio demo is paid for by
 * the person who wrote it, so it gets a ceiling as well as a rate.
 *
 * ## Why this one fails closed, and the token bucket does not
 *
 * Every other Redis call in this project fails open, for a reason that is
 * written out in `limiter.ts`: blocking all syncing because a cache is
 * unreachable is worse than sending a request a limiter would have paced, and
 * the 429 that follows is already handled.
 *
 * The cost of being wrong is the other way round here. Failing open on a counter
 * whose entire job is to bound spending turns a Redis blip into an uncapped
 * bill, and failing closed costs a visitor one sentence saying the assistant is
 * not answering right now. Same infrastructure, opposite policy, because the
 * thing being protected is different — that is the decision, not an oversight.
 *
 * The Upstash-is-not-configured path is not a failure and keeps working: it
 * counts in this process, which is correct for one process and wrong for more
 * than one, exactly like the other three fallbacks.
 */

const DEFAULT_DAILY_CAP = 200;

/**
 * Read at call time rather than at import: `next build` loads every route
 * module to collect its page data, and a constant frozen at build time could
 * not be raised without a redeploy.
 */
export function dailyCap(): number {
  const configured = Number(process.env.ASSISTANT_DAILY_CAP);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_DAILY_CAP;
}

/** Until midnight UTC — the same boundary the key is named after. */
const msUntilTomorrow = (now: Date): number =>
  endOfUtcDayExclusive(utcDay(now)).getTime() - now.getTime();

/**
 * Add one and report the day's total.
 *
 * `INCR` rather than a read and a write, because two requests that both read 199
 * and both write 200 have between them answered two questions and counted one —
 * the same read-modify-write problem the token bucket needed Lua for, solved
 * here by a command Redis already makes atomic.
 */
async function spend(now: Date): Promise<number> {
  const key = askDayKey(utcDay(now));
  const ttlMs = msUntilTomorrow(now);

  const client = redis();
  if (!client) {
    const used = (memoryCounters.get(key, now.getTime()) ?? 0) + 1;
    memoryCounters.set(key, used, ttlMs, now.getTime());
    return used;
  }

  const used = await client.incr(key);
  // Only the request that created the key sets its expiry. Doing it every time
  // would be harmless but pointless; doing it never would leak a key a day.
  if (used === 1) await client.pexpire(key, ttlMs);
  return used;
}

export type DailyBudget = { used: number; cap: number };

/**
 * Spend one question from the day's allowance, or refuse.
 *
 * Counted before the model is called, not after: a request that fails halfway
 * has still cost something, and a counter that only recorded successes would be
 * the wrong shape for a spending cap. The cost of that choice is that a run of
 * upstream errors eats the day's budget, which is the safe direction to be
 * wrong in.
 */
export async function spendDailyBudget(now = new Date()): Promise<DailyBudget> {
  const cap = dailyCap();

  let used: number;
  try {
    used = await spend(now);
  } catch (error) {
    console.error('[assistant:budget]', error);
    throw new AppError(
      'ASSISTANT_UNAVAILABLE',
      'The assistant cannot check its daily budget right now, so it is not answering.',
    );
  }

  if (used > cap) {
    throw new AppError(
      'RATE_LIMITED',
      `This demo answers ${cap} questions a day and has answered them all. The count resets at 00:00 UTC.`,
      { used, cap },
    );
  }

  return { used, cap };
}
