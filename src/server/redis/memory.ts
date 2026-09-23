/**
 * What the Redis-backed features fall back to when Upstash is not configured.
 *
 * Not a Redis emulator — three small stores shaped like the three things this
 * milestone actually needs. Faking the command surface would mean writing a
 * second Redis badly; this way each feature has one narrow port with two
 * implementations behind it, and the in-process one is short enough to read.
 *
 * The maps are module-level, so in `next dev` they survive a hot reload the way
 * the Prisma client does, and in a serverless deployment they survive exactly as
 * long as the instance does — which is the limitation, stated in client.ts.
 */

type Entry<T> = { value: T; expiresAt: number | null };

class ExpiringMap<T> {
  private readonly entries = new Map<string, Entry<T>>();

  get(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number, now = Date.now()): void {
    this.entries.set(key, { value, expiresAt: ttlMs ? now + ttlMs : null });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}

/** Serialised JSON, exactly as it would be stored in Redis. */
export const memoryCache = new ExpiringMap<string>();

/** Token bucket state per channel: { tokens, updatedAt }. */
export const memoryBuckets = new ExpiringMap<{ tokens: number; updatedAt: number }>();

/**
 * Plain counters that expire: the assistant's questions-per-day cap.
 *
 * Read-modify-write in one process is atomic here for the same reason it is not
 * on the Redis path — there is only ever one of us. `INCR` does the same job on
 * the other side, which is why the port is "add one and tell me the total"
 * rather than a get and a set.
 */
export const memoryCounters = new ExpiringMap<number>();

/**
 * The retry queue: one map per channel, ref -> when it is due and how many times
 * it has failed. A Map preserves insertion order, and the queue is read by due
 * time, so callers sort — the same work the sorted set does on the other path.
 */
export const memoryQueues = new Map<string, Map<string, { dueAt: number; attempt: number }>>();

export function memoryQueue(key: string): Map<string, { dueAt: number; attempt: number }> {
  let queue = memoryQueues.get(key);
  if (!queue) {
    queue = new Map();
    memoryQueues.set(key, queue);
  }
  return queue;
}
