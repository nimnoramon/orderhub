import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { listChannelSummaries } from '@/server/services/channels';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const merchantId = await requireMerchantId();
  return json({ data: await listChannelSummaries(merchantId) });
});
