import { requireMerchantId } from '@/server/auth/session';
import { json, readJson, route } from '@/server/http/handler';
import { createMovement } from '@/lib/schemas/stock';
import { adjustStock } from '@/server/services/stock';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

export const POST = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const input = createMovement.parse(await readJson(request));
  return json(await adjustStock(merchantId, input), 201);
});
