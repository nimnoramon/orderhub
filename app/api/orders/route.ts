import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { orderListQuery } from '@/lib/schemas/orders';
import { cleanParams } from '@/lib/schemas/query';
import { listOrders } from '@/server/services/orders';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const query = orderListQuery.parse(cleanParams(new URL(request.url).searchParams));
  return json(await listOrders(merchantId, query));
});
