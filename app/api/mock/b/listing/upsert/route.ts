import { BATCH_LIMIT, fail, guard, listingUpsertBody, ok, reviewListings } from '@/mock/b';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mock/b/listing/upsert
 *
 * Ten listings a call, keyed by `sku_code`: sending the same listing twice
 * updates it rather than creating a second one, which is what makes it safe for
 * a connector to retry this call after a 500. The answer is a 200 whenever the
 * request itself was well formed, with the refusals inside it — B and A disagree
 * about nearly everything, but not about that.
 */
export async function POST(request: Request) {
  const refused = guard(request);
  if (refused) return refused;

  const body = await request.json().catch(() => null);
  const parsed = listingUpsertBody.safeParse(body);
  if (!parsed.success) {
    return fail(
      400,
      'BAD_REQUEST',
      'Expected { listings: [{ sku_code, name, price, currency_code, attributes }] }.',
    );
  }

  const { listings } = parsed.data;
  if (listings.length === 0) return fail(400, 'BAD_REQUEST', 'Send at least one listing.');
  // The cap is on the call, so this is a whole-request failure rather than a
  // per-item one. The adapter advertises the same number as `batchLimit` and
  // chunks before it ever gets here.
  if (listings.length > BATCH_LIMIT) {
    return fail(413, 'BATCH_TOO_LARGE', `At most ${BATCH_LIMIT} listings per call.`);
  }

  return ok(reviewListings(listings));
}
