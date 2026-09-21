import { appBaseUrl } from '@/lib/app-url';
import { signBody } from '@/lib/hmac';
import { authorize, dispatchBody, fail, notificationPayload, webhookSecret } from '@/mock/b';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mock/b/hooks/dispatch
 *
 * B's half of the webhook story, triggered by hand so the demo can show a
 * delivery arriving. Its signature is not A's: the digest is base64 rather than
 * prefixed hex, and the timestamp beside it counts milliseconds rather than
 * seconds. Neither is better — they are different because two marketplaces that
 * had never met would be different, and a receiver that quietly worked for both
 * would be a receiver that had not actually checked anything.
 *
 * The delivery URL is one OrderHub handed over when the channel was connected,
 * verify token and all; the mock reads it from the environment because that is
 * where this deployment keeps it.
 */
const registeredTarget = (): string =>
  `${appBaseUrl()}/api/webhooks/mock_b?token=${encodeURIComponent(process.env.WEBHOOK_VERIFY_TOKEN ?? 'orderhub-demo-token')}`;

export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const parsed = dispatchBody.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return fail(400, 'BAD_REQUEST', 'Expected { kind?, orderIndex?, target? }.');

  const { kind, orderIndex, target } = parsed.data;
  const url = target ?? registeredTarget();

  // Signed over the serialised string, and that same string is what is sent.
  // Re-serialising the payload at the receiving end and hashing that would pass
  // here and fail against any real channel, where key order is not ours to pick.
  const raw = JSON.stringify(notificationPayload(kind, orderIndex));
  const timestamp = Date.now();
  const signature = signBody(webhookSecret(), raw, timestamp, 'base64');

  let status: number | null = null;
  let note: string | null = null;
  try {
    const delivery = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mockb-kind': kind,
        'x-mockb-ts': String(timestamp),
        'x-mockb-sig': signature,
      },
      body: raw,
      signal: AbortSignal.timeout(5_000),
    });
    status = delivery.status;
  } catch (error) {
    note = error instanceof Error ? error.message : 'delivery failed';
  }

  return Response.json({
    status: 'OK',
    result: {
      delivered: status !== null && status >= 200 && status < 300,
      target: url,
      response_status: status,
      note,
      sent: { headers: { 'x-mockb-ts': String(timestamp), 'x-mockb-sig': signature }, body: raw },
    },
  });
}
