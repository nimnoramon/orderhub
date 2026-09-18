import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { getProduct } from '@/server/services/products';

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const merchantId = await requireMerchantId();
  const { id } = await context.params;
  return json(await getProduct(merchantId, id));
});
