import { Redis } from '@upstash/redis';

/**
 * The Upstash connection, or an honest `null`.
 *
 * Upstash speaks HTTP rather than the Redis wire protocol, which is the whole
 * reason it is the choice here: a serverless function that lives for 200ms
 * cannot afford to open, authenticate and tear down a TCP connection, and a
 * connection pool has nowhere to live between invocations.
 *
 * `null` when the two variables are unset is deliberate. A fresh clone of this
 * repository has no Upstash account behind it, and a demo that refuses to start
 * until somebody signs up for a third service is a demo nobody runs. Every
 * feature that uses Redis carries an in-process fallback (see `memory.ts`) and
 * says so out loud, once, at startup.
 *
 * What the fallback is not: correct. In-process state is per instance, and
 * Vercel runs as many instances as it likes — a token bucket that lives in one
 * of them limits nothing, and a retry queue that lives in one of them is invisible
 * to the next request. That is stated in the README rather than hidden here.
 */

let resolved = false;
let instance: Redis | null = null;

export function redis(): Redis | null {
  // Read on first use, not at import: `next build` loads every route module to
  // collect its page data, and an import that needed environment variables
  // would fail a build of an app that runs perfectly well.
  if (resolved) return instance;
  resolved = true;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    console.warn(
      '[redis] UPSTASH_REDIS_REST_URL / _TOKEN are not set — the rate limiter, the retry queue ' +
        'and the dashboard cache are running in this process only. Correct for one process, ' +
        'wrong for more than one. See "Redis" in the README.',
    );
    return null;
  }

  instance = new Redis({ url, token });
  return instance;
}

/**
 * Redis being unreachable must not take a sync or a page down with it.
 *
 * Every call site here is a cache, a counter or a queue — useful, never the
 * system of record. The database still holds the catalog, the orders and the
 * sync log, so the worst case of a failed Redis call is work repeated or a
 * request sent that a limiter would have paced. Losing the request that carried
 * it would be the larger failure, so the error is logged and swallowed and the
 * caller gets the "nothing there" answer it would get from an empty cache.
 */
export async function tolerant<T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.error(`[redis:${label}]`, error);
    return fallback;
  }
}
