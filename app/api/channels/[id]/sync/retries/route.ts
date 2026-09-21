import { requireMerchantId } from '@/server/auth/session';
import { json, route } from '@/server/http/handler';
import { runCatalogRetries } from '@/server/services/sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/channels/:id/sync/retries
 *
 * Pushes the catalog items whose backoff has elapsed, and nothing else.
 *
 * It answers 200 with `job: null` when nothing was due. That is not an error —
 * the queue is working exactly as designed when it tells you to come back in
 * forty seconds — and returning a 4xx would make a cron treat a healthy queue
 * as a broken endpoint.
 *
 * In a deployment with a scheduler this is the URL the scheduler calls. The
 * button on the Channels screen exists because this demo has no scheduler and
 * an interviewer should be able to watch a retry happen rather than be told
 * that one would.
 */
export const POST = route(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const merchantId = await requireMerchantId();
  const { id } = await params;
  return json(await runCatalogRetries(merchantId, id));
});
