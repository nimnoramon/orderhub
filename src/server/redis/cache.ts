import { redis, tolerant } from './client';
import { memoryCache } from './memory';

/**
 * A JSON value with a time to live. The only cache in this project.
 *
 * Nothing stored through here is a fact — it is a copy of one that Postgres
 * still holds. That is the rule that makes every decision below easy: a miss
 * costs a query, a stale read costs at most the TTL, and a Redis outage costs
 * nothing at all (see `tolerant`).
 */

/**
 * Upstash deserialises on the way out: a value written as a JSON string comes
 * back already parsed. Other clients return the raw string. Accepting both
 * spellings is three lines and removes a class of "worked locally" bug from the
 * boundary between the fallback and the real thing.
 */
function decode<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Something else wrote this key, or wrote it in another shape. A cache is
    // allowed to shrug; the caller recomputes.
    return null;
  }
}

export async function readCache<T>(key: string): Promise<T | null> {
  const client = redis();
  if (!client) return decode<T>(memoryCache.get(key));

  return tolerant(`get ${key}`, async () => decode<T>(await client.get(key)), null);
}

export async function writeCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const payload = JSON.stringify(value);

  const client = redis();
  if (!client) {
    memoryCache.set(key, payload, ttlSeconds * 1000);
    return;
  }

  await tolerant(`set ${key}`, () => client.set(key, payload, { ex: ttlSeconds }), null);
}

/**
 * Drop a key because the thing it described has changed.
 *
 * Delete-after-write, not write-through: the writer knows the old answer is
 * wrong but not what the new one is, and computing it inside the request that
 * changed an order would make every write pay for a read nobody asked for.
 *
 * The race this accepts: a read that missed the cache can finish after the
 * delete and write a value it computed before the change, which then lives for
 * the rest of the TTL. Sixty seconds of a slightly old count on a dashboard is
 * a price worth paying here; the fix, if it ever were not, is a generation
 * counter in the key rather than a lock.
 */
export async function dropCache(key: string): Promise<void> {
  const client = redis();
  if (!client) {
    memoryCache.delete(key);
    return;
  }

  await tolerant(`del ${key}`, () => client.del(key), 0);
}
