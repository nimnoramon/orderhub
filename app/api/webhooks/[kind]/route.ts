import { json, route } from '@/server/http/handler';
import { receiveWebhook } from '@/server/services/webhooks';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/:kind?token=…
 *
 * The one route in this app that is not called by a person or by us. It reads
 * the body as text rather than JSON on purpose: the signature covers the bytes
 * that arrived, and re-serialising a parsed object to check them would verify a
 * body the channel never sent — a mistake that passes locally, where both sides
 * are the same JSON encoder, and fails against every real marketplace.
 *
 * No session: a marketplace has no cookie. What stands in for one is the verify
 * token in the URL and the signature in the headers, both checked in the service.
 */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ kind: string }> }) => {
    const { kind } = await params;

    return json(
      await receiveWebhook({
        kind,
        token: new URL(request.url).searchParams.get('token'),
        headers: request.headers,
        rawBody: await request.text(),
      }),
    );
  },
);
