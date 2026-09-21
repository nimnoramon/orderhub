import type { Prisma } from '@/generated/prisma/client';
import type { ChannelAdapter } from '@/server/channels/adapter';
import { AppError } from '@/server/http/errors';
import type { SyncFailure } from '@/lib/types';
import { ingestOrder, type IngestContext } from './ingest';

/**
 * Reading a channel's order feed, page by page, without ever losing one or
 * writing one twice.
 *
 * The rule this file exists for is invariant 4: the cursor advances only after a
 * whole page has been written. Everything else follows from it — a crash, a
 * timeout or a 429 mid-run leaves the cursor pointing at the start of a page
 * that was partly written, the next run reads that page again, and every order
 * already in the database comes back as a duplicate instead of a second row.
 * At-least-once delivery is only safe because of the unique index; the cursor
 * discipline is what keeps the "at least" from becoming "at most".
 *
 * Its dependencies are arguments, not imports, so the loop can be run in a test
 * against a fake adapter and a fake table.
 */

/**
 * How many pages one click reads. A bound rather than "until caught up" because
 * this runs inside the request that asked for it: a feed that is ten thousand
 * orders behind would otherwise be a request that never returns. The cursor
 * makes the next click continue rather than start over, which is the whole
 * point of storing it.
 */
export const MAX_PAGES_PER_RUN = 3;

/** A whole-run failure has no item to point at — the same mark the runner uses. */
const RUN_LEVEL_REF = '—';

export type PullDeps = {
  adapter: Pick<ChannelAdapter, 'pullOrders'>;
  db: Prisma.TransactionClient;
  context: IngestContext;
  cursor?: string;
  maxPages?: number;
  /**
   * Called once a page is fully written, with where the channel says to continue
   * from. This is the only place the cursor may move, and it is a callback so
   * that the loop cannot move it by accident.
   */
  onPageCommitted(next: string | undefined): Promise<void>;
};

export type PullOutcome = {
  itemsOk: number;
  failures: SyncFailure[];
  pages: number;
  created: number;
  duplicates: number;
};

function describe(error: unknown, ref: string): SyncFailure {
  if (error instanceof AppError) return { ref, code: error.code, message: error.message };

  console.error('[sync:orders]', error);
  return { ref, code: 'INTERNAL', message: 'Unexpected error — see the server log' };
}

export async function readPages(deps: PullDeps): Promise<PullOutcome> {
  const maxPages = deps.maxPages ?? MAX_PAGES_PER_RUN;
  const failures: SyncFailure[] = [];

  let cursor = deps.cursor;
  let pages = 0;
  let created = 0;
  let duplicates = 0;

  for (let page = 0; page < maxPages; page += 1) {
    let batch;
    try {
      batch = await deps.adapter.pullOrders(cursor);
    } catch (error) {
      // The channel is the one that failed, and it failed for the whole page.
      // Recording it per order would invent results for orders nobody ever saw.
      failures.push(describe(error, RUN_LEVEL_REF));
      break;
    }
    pages += 1;

    let pageFailed = false;
    for (const order of batch.orders) {
      try {
        if ((await ingestOrder(deps.db, deps.context, order)) === 'created') created += 1;
        else duplicates += 1;
      } catch (error) {
        failures.push(describe(error, order.externalId));
        pageFailed = true;
      }
    }

    // One order we could not write means the page did not commit, so the cursor
    // stays where it is and the whole page is read again next time. Advancing
    // over it would be the one failure this design refuses to have: an order the
    // channel sent and we will never ask for again.
    if (pageFailed) break;

    await deps.onPageCommitted(batch.next);

    // An empty page is how a watermark feed says "caught up", and a channel that
    // hands back the cursor it was given would otherwise loop forever.
    if (batch.orders.length === 0 || !batch.next || batch.next === cursor) break;
    cursor = batch.next;
  }

  return { itemsOk: created + duplicates, failures, pages, created, duplicates };
}
