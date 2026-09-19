import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { getOrder } from '@/server/services/orders';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const merchantId = await requireMerchantId();
  const { id } = await params;
  return json(await getOrder(merchantId, id));
});
