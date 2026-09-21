import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { getDashboardSummary } from '@/server/services/dashboard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/summary
 *
 * The overview's numbers, computed at most once a minute per merchant. The
 * screen that reads it arrives with milestone 7; the endpoint is here first
 * because the cache and its invalidation are the interesting half, and they are
 * testable by clicking around the app that already exists.
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
