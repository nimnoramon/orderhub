import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { pullOrders } from '@/server/services/sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/:id/sync/orders
 *
 * Reads the next few pages of the channel's order feed and answers with the
 * finished job. Like the catalog push, the status code says whether the sync was
 * *started* and the body says how it went: a run that ended `partial` because
 * MockShop B rate-limited the second page is a request that did exactly what it
 * was asked to.
 *
 * Safe to click twice. The second run either reads a page it has already read —
 * and writes nothing, because of the unique index — or carries on from the
 * cursor the first one committed.
 */
export const POST = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const merchantId = await requireMerchantId();
  const { id } = await params;
  return json(await pullOrders(merchantId, id));
});
