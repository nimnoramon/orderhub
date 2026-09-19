import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { pushCatalog } from '@/server/services/sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/:id/sync/catalog
 *
 * Answers with the finished job, whatever the job's outcome was — a run that
 * ended `failed` because MockShop A never answered is still a request that did
 * what it was asked to and recorded the result. The status code describes
 * whether the sync was *started*, and the body describes how it went; collapsing
 * the two would leave the caller unable to tell "your request was wrong" from
 * "the channel is down", which are answered by very different people.
 *
 * The 4xx cases are the ones where no job exists to describe: an unknown
 * channel, a disconnected one, a channel with no connector, or a sync of the
 * same kind already running.
 */
export const POST = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const merchantId = await requireMerchantId();
  const { id } = await params;
  return json(await pushCatalog(merchantId, id));
});
