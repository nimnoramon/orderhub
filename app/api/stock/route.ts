import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { cleanParams } from '@/lib/schemas/query';
import { stockLevelsQuery } from '@/lib/schemas/stock';
import { getStockLevels } from '@/server/services/stock';

/** Derived levels. There is no qty column to read — this is SUM(delta), always. */
export const GET = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const query = stockLevelsQuery.parse(cleanParams(new URL(request.url).searchParams));
  return json(await getStockLevels(merchantId, query));
});
