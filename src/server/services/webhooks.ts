import { ChannelKind, OrderStatus } from '@/generated/prisma/enums';
import { constantTimeEqual } from '@/lib/hmac';
import { prisma } from '@/server/db';
import type { WebhookEvent } from '@/server/channels/adapter';
import { adapterFor } from '@/server/channels/registry';
import { AppError, notFound } from '@/server/http/errors';
import { ingestOrder, variantIdsBySku } from '@/server/orders/ingest';
import { transitionOrder } from '@/server/services/orders';

/**
 * The receiving end of a marketplace webhook.
 *
 * Three things have to be true before a delivery is allowed to change anything,
 * and they are different things: the URL has to be one we handed out (the verify
 * token), the body has to be signed by the channel that claims to have sent it
 * (the signature), and the payload has to say something this connector knows how
 * to do. Only the middle one is cryptography; the first is a cheap way to make a
 * stranger's request stop before it costs a database query, and the third is
 * where a channel and an app disagree about vocabulary.
 *
 * Nothing here is queued, because there is no worker in this demo — the run
 * happens inside the request, the same honest shortcut the sync runner takes.
 */

export type WebhookReceipt = {
  received: true;
  event: string;
  externalId: string;
  applied: 'created' | 'cancelled' | 'ignored';
  reason?: string;
};

/**
 * The token that makes a webhook URL ours. Matches the value the mock senders
 * were configured with; changing one without the other is how you find out this
 * check works.
 */
const verifyToken = (): string => process.env.WEBHOOK_VERIFY_TOKEN ?? 'orderhub-demo-token';

/**
 * It is in the query string because a marketplace is configured with a URL, not
 * with a header — which also means it travels through every access log between
 * here and there. That is exactly why it is not the thing that authenticates the
 * request: the signature is. The token only buys an early, cheap refusal.
 */
function assertToken(token: string | null): void {
  if (!token || !constantTimeEqual(verifyToken(), token)) {
    throw new AppError('UNAUTHORIZED', 'This webhook URL is wrong or out of date.');
  }
}

const isChannelKind = (value: string): value is ChannelKind => value in ChannelKind;

export async function receiveWebhook(input: {
  kind: string;
  token: string | null;
  headers: Headers;
  rawBody: string;
}): Promise<WebhookReceipt> {
  assertToken(input.token);

  if (!isChannelKind(input.kind)) throw notFound('Channel');

  /**
   * One channel per kind, because this demo has one merchant. A multi-tenant
   * version would put the channel's own id in the URL it gives each merchant —
   * the kind alone cannot say whose webhook this is, and guessing would be the
   * bug that shows one merchant another's orders. Multi-tenancy is in the
   * README's "not in scope" for exactly this sort of reason.
   */
  const channel = await prisma.channel.findFirst({
    where: { kind: input.kind },
    select: { id: true, merchantId: true, name: true, kind: true, isActive: true, credentials: true },
  });
  if (!channel) throw notFound('Channel');

  if (!channel.isActive) {
    throw new AppError('CONFLICT', `${channel.name} is disconnected; its deliveries are not applied.`);
  }

  const adapter = adapterFor(channel);
  if (!adapter) throw new AppError('CONFLICT', `${channel.name} has no connector.`);

  // Verified against the bytes that arrived, before anything parses them. A
  // payload that has not been verified is a stranger's opinion about our data.
  if (!adapter.verifyWebhook(input.headers, input.rawBody)) {
    throw new AppError('UNAUTHORIZED', 'The signature on this delivery did not verify.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'The delivery body was not valid JSON.');
  }

  return apply(channel, adapter.parseWebhook(payload));
}

type Channel = { id: string; merchantId: string; kind: ChannelKind };

/**
 * What a verified notification actually does.
 *
 * Every outcome is a 200. A webhook that cannot be applied — an order we have
 * never pulled, a cancellation of something already shipped — is still a webhook
 * that arrived and was understood, and answering 4xx would make the channel
 * redeliver it every few minutes for a day in the hope that we change our mind.
 * The receipt says what happened instead, which is the part a human reads when
 * they ask why an order did not move.
 */
async function apply(channel: Channel, event: WebhookEvent): Promise<WebhookReceipt> {
  const receipt = { received: true as const, event: event.type, externalId: event.externalId };
  const ignored = (reason: string): WebhookReceipt => ({ ...receipt, applied: 'ignored', reason });

  if (event.type === 'order.cancelled') {
    const order = await prisma.order.findFirst({
      where: { channelId: channel.id, externalId: event.externalId },
      select: { id: true },
    });
    if (!order) return ignored('No order with that reference has been pulled yet.');

    try {
      // Through the service, so the state machine decides, the event is written
      // and a paid order's stock goes back on the shelf. A channel cancelling an
      // order is the same move as a human clicking Cancel, and it goes the same
      // way — only the actor differs.
      await transitionOrder(
        channel.merchantId,
        order.id,
        { to: OrderStatus.cancelled, note: 'Cancelled on the channel' },
        `channel:${channel.kind}`,
      );
      return { ...receipt, applied: 'cancelled' };
    } catch (error) {
      if (error instanceof AppError && ['ILLEGAL_TRANSITION', 'CONFLICT'].includes(error.code)) {
        return ignored(error.message);
      }
      throw error;
    }
  }

  if (!event.order) {
    return ignored('This notification carried no order, and this connector does not fetch one.');
  }

  // `order.updated` on an order we already have is deliberately a no-op. What a
  // marketplace means by "updated" varies, and writing a fresh total over an
  // order that has already been packed is worse than leaving it alone — a merge
  // policy is a feature, and this demo does not have one.
  const outcome = await ingestOrder(
    prisma,
    {
      merchantId: channel.merchantId,
      channelId: channel.id,
      actor: `channel:${channel.kind}`,
      variantIdBySku: await variantIdsBySku(
        prisma,
        channel.merchantId,
        event.order.lines.map((line) => line.sku),
      ),
    },
    event.order,
  );

  return outcome === 'created'
    ? { ...receipt, applied: 'created' }
    : ignored('This order had already been recorded.');
}
