import {
  BATCH_LIMIT,
  authorize,
  catalogBatchBody,
  fail,
  reviewBatch,
} from '@/mock/a';

// A third party, not OrderHub. These handlers deliberately do not use
// `src/server/http` — MockShop A has its own error envelope, and routing its
// failures through our mapper would quietly make the two systems agree about
// something they have no reason to agree about.
export const dynamic = 'force-dynamic';

/**
 * POST /api/mock/a/catalog/batch
 *
 * Up to 50 listings at a time. The response is a 200 whenever the batch itself
 * was well formed, even if every item in it was rejected: the per-item results
 * are the answer, and a caller that only looks at the status code learns
 * nothing. That asymmetry is the entire reason `SyncJob.status` has a `partial`.
 */
export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = catalogBatchBody.safeParse(body);
  if (!parsed.success) {
    return fail(400, 'INVALID_BODY', 'Expected { items: [{ sku, title, price_cents, currency, options }] }.');
  }

  const { items } = parsed.data;
  if (items.length === 0) {
    return fail(400, 'EMPTY_BATCH', 'A batch must contain at least one item.');
  }
  // The cap is on the request, so this one is a hard failure rather than a
  // per-item one. The adapter advertises the same number as `batchLimit` and
  // chunks before it ever gets here.
  if (items.length > BATCH_LIMIT) {
    return fail(400, 'TOO_MANY_ITEMS', `A batch accepts at most ${BATCH_LIMIT} items; received ${items.length}.`);
  }

  return Response.json(reviewBatch(items));
}
