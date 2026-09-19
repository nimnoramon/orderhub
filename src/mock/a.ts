import { z } from 'zod';
import { hash32, seeded } from './prng';

/**
 * MockShop A — a marketplace, not part of OrderHub.
 *
 * It lives in this repository because a demo that needs a second service to be
 * running is a demo nobody clicks. Everything below is deliberately written as
 * if by someone else: its own field names, its own error envelope, its own API
 * key, its own idea of what a batch is. Nothing here imports a service, a schema
 * or a type from `src/server` or `src/lib/types` — the only thing the two sides
 * share is the HTTP contract, which is exactly the constraint that makes the
 * adapter layer worth having.
 *
 * Its awkwardnesses, chosen to be realistic rather than cruel:
 *  - catalog is a batch endpoint capped at 50, and answers per item
 *  - a partly-rejected batch is still a 200; the failures are in the body
 *  - orders are cursor-paginated, not page-numbered
 *  - webhooks carry an HMAC signature over `timestamp.body`
 *
 * MockShop B (milestone 5) is the unkind one: different names, different date
 * format, rate limits, and the occasional 500.
 */

export const BATCH_LIMIT = 50;

/** Matches the key the seed stores on the channel row, so a fresh clone just works. */
export const apiKey = (): string => process.env.MOCK_A_API_KEY ?? 'mock-a-key';

export const webhookSecret = (): string => process.env.MOCK_A_WEBHOOK_SECRET ?? 'mock-a-secret';

// --- A's own error envelope ---------------------------------------------------
// Not `{ error: { code, message } }`. If both sides shaped errors the same way,
// the adapter's mapping would look unnecessary — and then the day a real channel
// arrived, there would be nowhere for the translation to live.

export const fail = (status: number, code: string, message: string): Response =>
  Response.json({ ok: false, error_code: code, error_message: message }, { status });

export function authorize(request: Request): Response | null {
  if (request.headers.get('x-mockshop-key') === apiKey()) return null;
  return fail(401, 'UNAUTHORIZED', 'Provide a valid x-mockshop-key header.');
}

// --- catalog ------------------------------------------------------------------

export const catalogBatchBody = z.object({
  items: z.array(
    z.object({
      sku: z.string().min(1).max(64),
      title: z.string().min(1),
      price_cents: z.number().int(),
      currency: z.string().length(3),
      options: z.record(z.string(), z.string()).default({}),
    }),
  ),
});
export type CatalogBatchBody = z.infer<typeof catalogBatchBody>;
export type CatalogItemPayload = CatalogBatchBody['items'][number];

export type ItemResult =
  | { sku: string; status: 'ok'; listing_id: string }
  | { sku: string; status: 'error'; code: string; message: string };

export type BatchResponse = {
  batch_id: string;
  accepted: number;
  rejected: number;
  results: ItemResult[];
};

/**
 * Why an item is rejected. Two of these are real validation; the third is the
 * one that matters for the demo — a listing the marketplace refuses for reasons
 * of its own, which no amount of validation on our side would have predicted.
 * It is keyed off a hash of the SKU rather than a random draw so the same push
 * always fails the same handful of items.
 */
function reject(item: CatalogItemPayload): { code: string; message: string } | null {
  if (item.price_cents <= 0) {
    return { code: 'INVALID_PRICE', message: 'price must be greater than zero' };
  }
  if (Object.keys(item.options).length === 0) {
    return { code: 'MISSING_ATTRIBUTE', message: 'at least one option is required by this channel' };
  }
  if (hash32(item.sku) % 17 === 0) {
    return { code: 'SKU_REJECTED', message: 'sku is already mapped to another listing' };
  }
  return null;
}

export function reviewBatch(items: CatalogItemPayload[]): BatchResponse {
  const results = items.map((item): ItemResult => {
    const rejected = reject(item);
    return rejected
      ? { sku: item.sku, status: 'error', ...rejected }
      : { sku: item.sku, status: 'ok', listing_id: `lst_${hash32(item.sku).toString(16)}` };
  });

  return {
    batch_id: `bat_${hash32(items.map((item) => item.sku).join('|')).toString(16)}`,
    accepted: results.filter((result) => result.status === 'ok').length,
    rejected: results.filter((result) => result.status === 'error').length,
    results,
  };
}

// --- orders -------------------------------------------------------------------

/**
 * A fixed universe of orders, generated on demand. Order n is always the same
 * order, so re-reading a cursor returns identical results — which is what makes
 * milestone 5's idempotency test mean something: the duplicates it must not
 * create are duplicates the channel really did hand over twice.
 *
 * The ids overlap the seeded MockShop A orders on purpose. A first pull against
 * a seeded database therefore meets orders it already has, which is the case
 * that the unique index on (channelId, externalId) exists to survive.
 */
const UNIVERSE = 240;
const EPOCH = new Date('2026-09-18T12:00:00Z');
const HOURS_BETWEEN_ORDERS = 6; // 240 orders over the seed's own 60 days of history

const CURSOR_PATTERN = /^cur_a_(\d{5})$/;
const cursorFor = (index: number) => `cur_a_${String(index).padStart(5, '0')}`;

/** An unparseable cursor starts from the beginning rather than erroring — A is lenient here. */
export function indexFromCursor(cursor: string | undefined): number {
  const matched = cursor ? CURSOR_PATTERN.exec(cursor) : null;
  if (!matched) return 0;
  return Math.min(Number(matched[1]), UNIVERSE);
}

/** The SKU shapes A sells, following the same convention the OrderHub catalog uses. */
const LISTINGS = [
  { code: 'AUD', values: ['BLACK', 'SAND', 'SLATE'] },
  { code: 'BAG', values: ['18L', '24L', '32L'] },
  { code: 'DSK', values: ['OAK', 'WALNUT', 'ASH'] },
  { code: 'KIT', values: ['S', 'M', 'L'] },
  { code: 'LGT', values: ['2700K', '4000K'] },
  { code: 'PWR', values: ['5000MAH', '10000MAH', '20000MAH'] },
] as const;

const FIRST_NAMES = ['Ana', 'Bram', 'Chidi', 'Dara', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jo'];
const LAST_NAMES = ['Alvarez', 'Bakker', 'Costa', 'Dahl', 'Eze', 'Fontaine', 'Gill', 'Haas'];

export type OrderPayload = {
  id: string;
  placed_at: string;
  currency: string;
  total_cents: number;
  customer: { name: string };
  lines: { sku: string; qty: number; unit_price_cents: number }[];
};

export function orderAt(index: number): OrderPayload {
  const random = seeded(`mock-a-order-${index}`);

  const lines = Array.from({ length: random.int(1, 3) }, () => {
    const listing = random.pick(LISTINGS);
    // The catalog is 50 products dealt round-robin across six categories, so a
    // category's product numbers are every sixth one. Some of the SKUs this
    // produces exist in OrderHub and some do not — a channel selling a listing
    // we have never heard of is the normal case, not an error.
    const productNumber = 1001 + LISTINGS.indexOf(listing) + 6 * random.int(0, 8);
    return {
      sku: `${listing.code}-${productNumber}-${random.pick(listing.values)}`,
      qty: random.int(1, 3),
      unit_price_cents: random.int(9, 249) * 100 + 99,
    };
  });

  const placedAt = new Date(
    EPOCH.getTime() - (UNIVERSE - 1 - index) * HOURS_BETWEEN_ORDERS * 3_600_000,
  );

  return {
    id: `A-${100_000 + index}`,
    placed_at: placedAt.toISOString(),
    currency: 'USD',
    total_cents: lines.reduce((sum, line) => sum + line.qty * line.unit_price_cents, 0),
    customer: { name: `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}` },
    lines,
  };
}

export const orderListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function ordersPage(cursor: string | undefined, limit: number) {
  const start = indexFromCursor(cursor);
  const end = Math.min(start + limit, UNIVERSE);
  const orders = Array.from({ length: Math.max(0, end - start) }, (_, offset) =>
    orderAt(start + offset),
  );

  return {
    orders,
    // Null at the end of the feed, not an empty string and not a repeat of the
    // last cursor: the caller needs to be able to tell that it has caught up.
    next_cursor: end < UNIVERSE ? cursorFor(end) : null,
    has_more: end < UNIVERSE,
  };
}

// --- webhooks -----------------------------------------------------------------

export const WEBHOOK_EVENTS = ['order.created', 'order.updated', 'order.cancelled'] as const;

export const webhookSendBody = z.object({
  event: z.enum(WEBHOOK_EVENTS).default('order.created'),
  /** Which order from the universe to talk about. Defaults to the newest. */
  orderIndex: z.coerce.number().int().min(0).max(UNIVERSE - 1).default(UNIVERSE - 1),
  /** Where to deliver. Defaults to this app's own receiver. */
  target: z.url().optional(),
});

export const webhookPayload = (event: string, index: number) => ({
  event,
  sent_at: new Date().toISOString(),
  order: orderAt(index),
});
