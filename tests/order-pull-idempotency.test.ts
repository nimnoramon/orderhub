import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { SyncJobStatus } from '@/generated/prisma/enums';
import type { ExternalOrder, OrderPage } from '@/server/channels/adapter';
import { AppError } from '@/server/http/errors';
import { readPages } from '@/server/orders/pull';
import type { IngestContext } from '@/server/orders/ingest';
import { statusForCounts } from '@/server/sync/runner';

/**
 * Re-pulling a page of orders must never create a second copy of one.
 *
 * This is the bug that bites every integration, and the reason the schema has a
 * unique index on `(channelId, externalId)` instead of a check in application
 * code. The fake table below is therefore not a stub of the database — it is a
 * table that enforces that one constraint and raises the same `P2002` Postgres
 * raises, so the code under test is the real ingest path meeting the real
 * failure, without a Postgres running.
 *
 * The other half of the story is the cursor: it may only move once a whole page
 * has been written, so that a run which dies halfway reads the page again rather
 * than stepping over the orders it never wrote.
 */

/** A table with one constraint, which is the only one that matters here. */
function fakeDatabase() {
  const rows = new Map<string, { externalId: string; items: unknown[] }>();

  const uniqueViolation = () =>
    Object.assign(new Error('Unique constraint failed: (`channelId`,`externalId`)'), {
      code: 'P2002',
      meta: { target: ['channelId', 'externalId'] },
    });

  const db = {
    order: {
      create: async ({ data }: { data: { channelId: string; externalId: string; items: { create: unknown[] } } }) => {
        const key = `${data.channelId}|${data.externalId}`;
        if (rows.has(key)) throw uniqueViolation();
        rows.set(key, { externalId: data.externalId, items: data.items.create });
        return { id: `ord_${rows.size}` };
      },
    },
  };

  return { db: db as unknown as Prisma.TransactionClient, rows };
}

const context: IngestContext = {
  merchantId: 'mer_1',
  channelId: 'chn_b',
  actor: 'channel:mock_b',
  variantIdBySku: new Map([['BAG-1002-24L', 'var_bag']]),
};

const orderAt = (index: number): ExternalOrder => ({
  externalId: `ORD-B-${770_000 + index}`,
  placedAt: new Date(Date.UTC(2026, 8, 18) + index * 3_600_000),
  customerName: 'Cai Duarte',
  currency: 'THB',
  totalCents: 1_000 + index,
  lines: [{ sku: 'BAG-1002-24L', qty: 1, unitPriceCents: 1_000 + index }],
});

/**
 * A feed whose cursor is an index, so a page is trivially repeatable: asking for
 * the same cursor twice returns the same orders, which is what a real cursor
 * feed promises and what makes re-reading one a fair test.
 */
function feed(universe: number, pageSize = 25) {
  const calls: (string | undefined)[] = [];

  return {
    calls,
    async pullOrders(cursor?: string): Promise<OrderPage> {
      calls.push(cursor);
      const start = cursor ? Number(cursor) : 0;
      const end = Math.min(start + pageSize, universe);
      const orders = Array.from({ length: Math.max(0, end - start) }, (_, offset) =>
        orderAt(start + offset),
      );
      return { orders, next: orders.length > 0 ? String(end) : undefined };
    },
  };
}

describe('re-reading a page', () => {
  it('writes every order once and nothing the second time', async () => {
    const { db, rows } = fakeDatabase();
    const committed: (string | undefined)[] = [];
    const deps = {
      adapter: feed(60),
      db,
      context,
      maxPages: 1,
      onPageCommitted: async (next: string | undefined) => {
        committed.push(next);
      },
    };

    const first = await readPages(deps);
    expect(first).toMatchObject({ created: 25, duplicates: 0, itemsOk: 25, failures: [] });
    expect(rows.size).toBe(25);

    // The same run again from the same cursor — a crash before the cursor was
    // written, a replayed delivery, or somebody clicking twice.
    const second = await readPages(deps);
    expect(second).toMatchObject({ created: 0, duplicates: 25, itemsOk: 25, failures: [] });
    expect(rows.size).toBe(25);

    // Both runs succeeded, and the second one is not a failure: "we already had
    // all 25" is a read of the feed that worked.
    expect(statusForCounts(second.itemsOk, second.failures.length)).toBe(SyncJobStatus.succeeded);
    expect(committed).toEqual(['25', '25']);
  });

  it('keeps the lines it could map and drops the SKUs it has never heard of', async () => {
    const { db, rows } = fakeDatabase();
    const unknownSku: ExternalOrder = {
      ...orderAt(0),
      lines: [
        { sku: 'BAG-1002-24L', qty: 1, unitPriceCents: 1_000 },
        { sku: 'XXX-9999-NOPE', qty: 4, unitPriceCents: 500 },
      ],
    };

    const outcome = await readPages({
      adapter: { pullOrders: async () => ({ orders: [unknownSku], next: undefined }) },
      db,
      context,
      maxPages: 1,
      onPageCommitted: async () => {},
    });

    // A marketplace selling a listing we do not carry is the normal case, not a
    // failed sync: the order lands, and the order screen shows the difference
    // between its total and the lines we could map.
    expect(outcome).toMatchObject({ created: 1, failures: [] });
    expect(rows.get('chn_b|ORD-B-770000')?.items).toHaveLength(1);
  });
});

describe('the cursor', () => {
  it('advances only after a whole page has been written', async () => {
    const { db, rows } = fakeDatabase();
    const committed: (string | undefined)[] = [];

    const outcome = await readPages({
      adapter: {
        // The second page is the one MockShop B rate-limits.
        pullOrders: async (cursor?: string) => {
          if (cursor) throw new AppError('RATE_LIMITED', 'MockShop B is rate limiting this channel.');
          return feed(60).pullOrders(undefined);
        },
      },
      db,
      context,
      onPageCommitted: async (next) => {
        committed.push(next);
      },
    });

    expect(rows.size).toBe(25);
    expect(committed).toEqual(['25']);
    expect(outcome.failures).toEqual([
      { ref: '—', code: 'RATE_LIMITED', message: 'MockShop B is rate limiting this channel.' },
    ]);
    // 25 orders read and one page that could not be: not a failure, not a clean
    // run. This is what `partial` is for.
    expect(statusForCounts(outcome.itemsOk, outcome.failures.length)).toBe(SyncJobStatus.partial);
  });

  it('does not move when one order in the page could not be written, so the page replays whole', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { db, rows } = fakeDatabase();
    const committed: (string | undefined)[] = [];
    let writes = 0;

    const flaky = {
      order: {
        create: async (args: Parameters<typeof db.order.create>[0]) => {
          writes += 1;
          if (writes === 13) throw new Error('connection terminated unexpectedly');
          return db.order.create(args);
        },
      },
    } as unknown as Prisma.TransactionClient;

    const deps = {
      adapter: feed(60),
      db: flaky,
      context,
      maxPages: 1,
      onPageCommitted: async (next: string | undefined) => {
        committed.push(next);
      },
    };

    // The rest of the page is still attempted — one order the database refused
    // is not a reason to abandon the twelve behind it — but the page did not
    // commit, so nothing moves the cursor.
    const died = await readPages(deps);
    expect(died.created).toBe(24);
    expect(died.failures).toHaveLength(1);
    expect(died.failures[0].ref).toBe('ORD-B-770012');
    expect(rows.size).toBe(24);
    expect(committed).toEqual([]);

    const replay = await readPages({ ...deps, db });
    expect(replay).toMatchObject({ created: 1, duplicates: 24, failures: [] });
    expect(rows.size).toBe(25);
    expect(committed).toEqual(['25']);
  });
});

describe('a run', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stops at its page limit and leaves the cursor where the next click continues', async () => {
    const { db, rows } = fakeDatabase();
    const committed: (string | undefined)[] = [];
    const channel = feed(100);

    const outcome = await readPages({
      adapter: channel,
      db,
      context,
      maxPages: 3,
      onPageCommitted: async (next) => {
        committed.push(next);
      },
    });

    expect(outcome.pages).toBe(3);
    expect(rows.size).toBe(75);
    expect(channel.calls).toEqual([undefined, '25', '50']);
    expect(committed.at(-1)).toBe('75');
  });

  it('stops on the empty page a caught-up feed answers with', async () => {
    const { db } = fakeDatabase();
    const committed: (string | undefined)[] = [];

    const outcome = await readPages({
      adapter: feed(10),
      db,
      context,
      maxPages: 3,
      onPageCommitted: async (next) => {
        committed.push(next);
      },
    });

    expect(outcome).toMatchObject({ pages: 2, created: 10, failures: [] });
    expect(committed).toEqual(['10', undefined]);
  });

  it('commits nothing at all when the first page cannot be fetched', async () => {
    const { db, rows } = fakeDatabase();
    const committed: (string | undefined)[] = [];

    const outcome = await readPages({
      adapter: {
        pullOrders: async () => {
          throw new AppError('CHANNEL_ERROR', 'MockShop B did not respond');
        },
      },
      db,
      context,
      onPageCommitted: async (next) => {
        committed.push(next);
      },
    });

    expect(rows.size).toBe(0);
    expect(committed).toEqual([]);
    expect(outcome.itemsOk).toBe(0);
    expect(statusForCounts(outcome.itemsOk, outcome.failures.length)).toBe(SyncJobStatus.failed);
  });
});
