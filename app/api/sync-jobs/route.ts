import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { cleanParams } from '@/lib/schemas/query';
import { syncJobListQuery } from '@/lib/schemas/sync';
import { listSyncJobs } from '@/server/services/sync';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const query = syncJobListQuery.parse(cleanParams(new URL(request.url).searchParams));
  return json(await listSyncJobs(merchantId, query));
});
