import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { getOrder } from '@/server/services/orders';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const merchantId = await requireMerchantId();
  const { id } = await params;
  return json(await getOrder(merchantId, id));
});
