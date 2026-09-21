import { fail, guard, indexFromToken, ok, orderListQuery, ordersPage } from '@/mock/b';

// A third party, not OrderHub. Like MockShop A's handlers these deliberately do
// not use `src/server/http` — B has its own error envelope, and routing its
// failures through our mapper would quietly make the two systems agree about
// something they have no reason to agree about.
export const dynamic = 'force-dynamic';

/**
 * GET /api/mock/b/order/list?page_token=2026-09-15T00:00:00.000Z&page_size=25
 *
 * Pagination by watermark rather than by position: the token is a moment, and a
 * page is the orders placed after it. Re-sending the same token returns exactly
 * the same orders — which is what makes an idempotent pull worth writing, and
 * what makes replaying a page after a crash harmless rather than a duplicate.
 *
 * Every call passes through `guard`, so this endpoint is also where the caller
 * meets the 429 and the occasional 500.
 */
export function GET(request: Request) {
  const refused = guard(request);
  if (refused) return refused;

  const parsed = orderListQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail(400, 'BAD_QUERY', 'page_size must be between 1 and 50.');

  const { page_token: pageToken, page_size: pageSize } = parsed.data;
  const start = indexFromToken(pageToken);
  if (start === null) {
    return fail(400, 'BAD_PAGE_TOKEN', 'page_token must be a timestamp this API issued.');
  }

  return ok(ordersPage(start, pageSize));
}
