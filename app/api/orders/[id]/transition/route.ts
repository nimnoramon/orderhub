import { currentActor, requireMerchantId } from '@/server/auth/session';
import { json, readJson, route } from '@/server/http/handler';
import { orderTransition } from '@/lib/schemas/orders';
import { transitionOrder } from '@/server/services/orders';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

/**
 * POST { to, note? }. A move the state machine does not allow comes back as a
 * 409 with a body that says why — the mapping lives in src/server/http.
 */
export const POST = route(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const merchantId = await requireMerchantId();
  const { id } = await params;
  const input = orderTransition.parse(await readJson(request));
  return json(await transitionOrder(merchantId, id, input, await currentActor()));
});
