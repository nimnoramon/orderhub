import { appBaseUrl } from '@/lib/app-url';
import { signBody } from '@/lib/hmac';
import { authorize, fail, webhookPayload, webhookSecret, webhookSendBody } from '@/mock/a';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mock/a/webhooks/send
 *
 * The sender half of the webhook story. A real marketplace fires these when
 * something happens on its side; here the delivery is triggered by hand so the
 * demo can show one arriving.
 *
 * The signature covers `timestamp.body` — see src/lib/hmac.ts for why the
 * timestamp is inside the signed string rather than merely beside it.
 *
 * The delivery URL is the one OrderHub handed over when the channel was
 * connected, verify token and all; the mock reads it from the environment
 * because that is where this deployment keeps it.
 */
const registeredTarget = (): string =>
  `${appBaseUrl()}/api/webhooks/mock_a?token=${encodeURIComponent(process.env.WEBHOOK_VERIFY_TOKEN ?? 'orderhub-demo-token')}`;
export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const parsed = webhookSendBody.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return fail(400, 'INVALID_BODY', 'Expected { event?, orderIndex?, target? }.');

  const { event, orderIndex, target } = parsed.data;
  const url = target ?? registeredTarget();

  // Signed over the serialised string, and that same string is what is sent.
  // Re-serialising the payload at the receiving end and hashing that would pass
  // here and fail against any real channel, where key order is not ours to pick.
  const raw = JSON.stringify(webhookPayload(event, orderIndex));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signBody(webhookSecret(), raw, timestamp);

  let status: number | null = null;
  let note: string | null = null;
  try {
    const delivery = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mockshop-event': event,
        'x-mockshop-timestamp': String(timestamp),
        'x-mockshop-signature': signature,
      },
      body: raw,
      signal: AbortSignal.timeout(5_000),
    });
    status = delivery.status;
  } catch (error) {
    note = error instanceof Error ? error.message : 'delivery failed';
  }

  return Response.json({
    delivered: status !== null && status >= 200 && status < 300,
    target: url,
    status,
    note,
    sent: { headers: { 'x-mockshop-timestamp': String(timestamp), 'x-mockshop-signature': signature }, body: raw },
  });
}
