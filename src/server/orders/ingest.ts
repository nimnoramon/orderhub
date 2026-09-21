import type { Prisma } from '@/generated/prisma/client';
import { OrderStatus } from '@/generated/prisma/enums';
import type { ExternalOrder } from '@/server/channels/adapter';

/**
 * Writing an order a channel handed us, exactly once.
 *
 * Both ways an order can arrive — a pull and a webhook — come through here, so
 * there is one answer to "what does an order from a marketplace look like once
 * it is ours", and one place where the duplicate is dealt with.
 *
 * The database client is a parameter rather than an import. That is what lets
 * `tests/order-pull-idempotency.test.ts` run the real code against a fake table
 * that enforces the real constraint, and prove the thing this project claims
 * without a Postgres running.
 */

export type IngestContext = {
  merchantId: string;
  channelId: string;
  /** Recorded on the order's first event: `channel:mock_b`, never a person. */
  actor: string;
  /** Built once per run — see `variantIdsBySku`. */
  variantIdBySku: Map<string, string>;
};

export type IngestResult = 'created' | 'duplicate';

/**
 * Postgres refusing a second row for the same `(channelId, externalId)`.
 *
 * Matched on the code rather than on an instance of Prisma's error class so the
 * test's fake can raise the same failure the database raises. A `P2002` reaching
 * here can only be that index: it is the only unique constraint an order insert
 * can violate.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * The SKUs a channel sells, resolved to variants we actually have.
 *
 * Built once per run rather than queried per order: a page of 25 orders would
 * otherwise be 25 more round trips for an answer that cannot change while the
 * run is in flight. No product-status filter — an order for an archived product
 * is still an order somebody placed, and refusing to record it would not unsell
 * the goods.
 *
 * Variant SKUs are unique per product rather than per merchant, so a collision
 * is possible in the schema and impossible in the catalog's naming convention;
 * first one wins.
 */
export async function variantIdsBySku(
  db: Prisma.TransactionClient,
  merchantId: string,
  skus?: string[],
): Promise<Map<string, string>> {
  const variants = await db.variant.findMany({
    where: { product: { merchantId }, ...(skus ? { sku: { in: skus } } : {}) },
    select: { id: true, sku: true },
  });

  const index = new Map<string, string>();
  for (const variant of variants) if (!index.has(variant.sku)) index.set(variant.sku, variant.id);
  return index;
}

/**
 * Write one external order, or find out we already had it.
 *
 * `create` and catch, rather than "look, then create": two concurrent pulls both
 * see nothing and both insert, and the second one has to be refused by the
 * database or not at all. The catch is what turns that refusal into "already
 * have it" instead of a failed run — at-least-once delivery made harmless, which
 * is the whole reason `Channel.cursor` is allowed to lag behind a page.
 *
 * Lines whose SKU is not in our catalog are dropped rather than failing the
 * order. A marketplace selling a listing we have never heard of is the normal
 * case, not an error, and the order detail screen already shows the order's own
 * total beside the total of the lines we could map, so the difference is visible
 * where somebody can act on it rather than counted as a sync failure.
 *
 * The order enters as `created` whatever the channel's own status field says.
 * Deciding that a marketplace's "DISPATCHED" is our `shipped` would put a second
 * set of transition rules outside the state machine, and the machine is the one
 * thing in this app that is allowed to move an order.
 */
export async function ingestOrder(
  db: Prisma.TransactionClient,
  context: IngestContext,
  order: ExternalOrder,
): Promise<IngestResult> {
  const items = order.lines.flatMap((line) => {
    const variantId = context.variantIdBySku.get(line.sku);
    return variantId ? [{ variantId, qty: line.qty, unitPriceCents: line.unitPriceCents }] : [];
  });

  try {
    await db.order.create({
      data: {
        merchantId: context.merchantId,
        channelId: context.channelId,
        externalId: order.externalId,
        status: OrderStatus.created,
        customerName: order.customerName,
        totalCents: order.totalCents,
        currency: order.currency,
        placedAt: order.placedAt,
        items: { create: items },
        // Dated when the order was placed rather than when we read it, so the
        // timeline reads as the order's history and not as ours.
        events: {
          create: {
            toStatus: OrderStatus.created,
            actor: context.actor,
            createdAt: order.placedAt,
          },
        },
      },
      select: { id: true },
    });
    return 'created';
  } catch (error) {
    if (isUniqueViolation(error)) return 'duplicate';
    throw error;
  }
}
