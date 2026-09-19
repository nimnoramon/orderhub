import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncJobStatus } from '@/generated/prisma/enums';
import { MockShopAAdapter } from '@/server/channels/mock-a';
import { statusForCounts } from '@/server/sync/runner';
import { BATCH_LIMIT, reviewBatch, type CatalogItemPayload } from '@/mock/a';
import { hash32 } from '@/mock/prng';

/**
 * Batch partial failure, from both ends: what MockShop A decides, what the
 * adapter makes of the answer, and what the runner calls the result.
 *
 * None of it touches a database, which is the point — the outcome rule is the
 * part of the sync model an interviewer asks about, and it should be provable
 * without a Postgres running.
 */

const item = (overrides: Partial<CatalogItemPayload> = {}): CatalogItemPayload => ({
  sku: 'AUD-1001-BLACK',
  title: 'Sturdy Audio speaker',
  price_cents: 2499,
  currency: 'USD',
  options: { colour: 'Black' },
  ...overrides,
});

/** A SKU the channel refuses for reasons of its own — found, not guessed. */
const refusedSku = (() => {
  for (let index = 0; index < 10_000; index += 1) {
    const sku = `AUD-${1001 + index}-BLACK`;
    if (hash32(sku) % 17 === 0) return sku;
  }
  throw new Error('no SKU hits the SKU_REJECTED rule — the rule has changed');
})();

describe('MockShop A: the batch catalog endpoint', () => {
  it('answers per item, and counts what it accepted and refused', () => {
    const response = reviewBatch([item({ sku: 'AUD-1002-SAND' }), item({ sku: refusedSku })]);

    expect(response.results).toHaveLength(2);
    expect(response.accepted + response.rejected).toBe(2);
    expect(response.results[0]).toMatchObject({ sku: 'AUD-1002-SAND', status: 'ok' });
    expect(response.results[1]).toMatchObject({ sku: refusedSku, status: 'error', code: 'SKU_REJECTED' });
  });

  it('rejects a price of zero and an item with no options', () => {
    const response = reviewBatch([
      item({ sku: 'BAG-1002-18L', price_cents: 0 }),
      item({ sku: 'DSK-1003-OAK', options: {} }),
    ]);

    expect(response.results.map((result) => result.status === 'error' && result.code)).toEqual([
      'INVALID_PRICE',
      'MISSING_ATTRIBUTE',
    ]);
  });

  it('decides the same way every time', () => {
    // The demo's screenshots, and milestone 6's retry queue, both depend on this:
    // a mock that failed a different set of items on each run would make the sync
    // log unreadable and the retry path impossible to show twice.
    const items = Array.from({ length: 40 }, (_, index) => item({ sku: `KIT-${1004 + index}-M` }));
    expect(reviewBatch(items)).toEqual(reviewBatch(items));
  });
});

describe('the MockShop A adapter', () => {
  const adapter = new MockShopAAdapter({ apiKey: 'mock-a-key', webhookSecret: 'mock-a-secret' });

  afterEach(() => vi.unstubAllGlobals());

  /** Stands in for the marketplace: the real rules, without the network. */
  const stubChannel = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { items: CatalogItemPayload[] };
        return Response.json(reviewBatch(body.items));
      }),
    );

  it('splits the channel’s answer into accepted refs and per-item failures', async () => {
    stubChannel();

    const result = await adapter.pushCatalog([
      { variantId: 'v1', sku: 'AUD-1002-SAND', title: 'Speaker', priceCents: 2499, currency: 'USD', attributes: { colour: 'Sand' } },
      { variantId: 'v2', sku: refusedSku, title: 'Speaker', priceCents: 2499, currency: 'USD', attributes: { colour: 'Black' } },
      { variantId: 'v3', sku: 'LGT-1005-2700K', title: 'Lamp', priceCents: 0, currency: 'USD', attributes: { temperature: '2700K' } },
    ]);

    expect(result.ok).toEqual(['AUD-1002-SAND']);
    expect(result.failed).toEqual([
      { ref: refusedSku, code: 'SKU_REJECTED', message: expect.any(String) },
      { ref: 'LGT-1005-2700K', code: 'INVALID_PRICE', message: expect.any(String) },
    ]);
  });

  it('refuses to send more than the channel’s batch limit', async () => {
    stubChannel();

    const oversized = Array.from({ length: BATCH_LIMIT + 1 }, (_, index) => ({
      variantId: `v${index}`,
      sku: `KIT-${1004 + index}-M`,
      title: 'Pan',
      priceCents: 1999,
      currency: 'USD',
      attributes: { size: 'M' },
    }));

    // The caller chunks; reaching the channel with 51 items would be our bug, and
    // it is worth failing on rather than letting A answer TOO_MANY_ITEMS.
    await expect(adapter.pushCatalog(oversized)).rejects.toThrow(/51/);
  });
});

describe('what a run’s counts mean', () => {
  it('is succeeded when nothing failed, including an empty catalog', () => {
    expect(statusForCounts(148, 0)).toBe(SyncJobStatus.succeeded);
    expect(statusForCounts(0, 0)).toBe(SyncJobStatus.succeeded);
  });

  it('is partial when some items landed and some did not', () => {
    // The reason SyncJob has five statuses instead of three.
    expect(statusForCounts(139, 9)).toBe(SyncJobStatus.partial);
    expect(statusForCounts(1, 147)).toBe(SyncJobStatus.partial);
  });

  it('is failed when nothing landed at all', () => {
    expect(statusForCounts(0, 148)).toBe(SyncJobStatus.failed);
  });
});
