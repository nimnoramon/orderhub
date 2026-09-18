import { requireMerchantId } from '@/server/auth/session';
import { json, readJson, route } from '@/server/http/handler';
import { createMovement } from '@/lib/schemas/stock';
import { adjustStock } from '@/server/services/stock';

export const POST = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const input = createMovement.parse(await readJson(request));
  return json(await adjustStock(merchantId, input), 201);
});
