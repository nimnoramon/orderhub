import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { orderListQuery } from '@/lib/schemas/orders';
import { cleanParams } from '@/lib/schemas/query';
import { listOrders } from '@/server/services/orders';

export const GET = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const query = orderListQuery.parse(cleanParams(new URL(request.url).searchParams));
  return json(await listOrders(merchantId, query));
});
