import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { cleanParams } from '@/lib/schemas/query';
import { stockLevelsQuery } from '@/lib/schemas/stock';
import { getStockLevels } from '@/server/services/stock';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

/** Derived levels. There is no qty column to read — this is SUM(delta), always. */
export const GET = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const query = stockLevelsQuery.parse(cleanParams(new URL(request.url).searchParams));
  return json(await getStockLevels(merchantId, query));
});
