import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { getDashboardSummary } from '@/server/services/dashboard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/summary
 *
 * The overview's numbers, computed at most once a minute per merchant.
 *
 * The screen does not come through here — a page calls the service, because a
 * server component fetching its own route would cost a round trip, an absolute
 * URL and a forwarded cookie to reach the same cached function. This endpoint
 * is for programs, and for watching the cache work from a terminal.
 *
 * `x-cache` is a header rather than a field because it describes this response,
 * not the merchant's data — and because being able to watch it flip to MISS the
 * moment an order changes status is the cheapest possible demonstration that
 * the invalidation works.
 */
export const GET = route(async () => {
  const merchantId = await requireMerchantId();
  const result = await getDashboardSummary(merchantId);

  const response = json(result);
  response.headers.set('x-cache', result.cached ? 'HIT' : 'MISS');
  return response;
});
