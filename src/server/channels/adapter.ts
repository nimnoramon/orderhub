import type { ChannelKind } from '@/generated/prisma/enums';
import { AppError } from '@/server/http/errors';

/**
 * The one interface every marketplace connector implements.
 *
 * Two adapters is the smallest number that keeps an interface honest: MockShop A
 * is polite and MockShop B (milestone 5) is not, and both have to fit through
 * these four methods without either of their peculiarities leaking upward. The
 * types below are OrderHub's own vocabulary — integer minor units, `Date`,
 * `sku` — so a service can push a catalog or pull a page of orders without ever
 * learning that one channel calls a price `price_cents` and the other sends it
 * as a decimal string.
 *
 * What an adapter may not do: touch the database, decide an order's status, or
 * build an HTTP response. It translates, and that is all.
 */

/** A variant, as a channel needs to hear about it. */
export type CatalogItem = {
  /** Ours, not the channel's. Carried so a failure can be traced back to a row. */
  variantId: string;
  sku: string;
  title: string;
  priceCents: number;
  currency: string;
  attributes: Record<string, string>;
};

/**
 * One item the channel refused. The shape matches `SyncJob.errorSummary` exactly,
 * so a failure travels from the channel's response to the screen without being
 * reshaped on the way.
 */
export type ItemFailure = { ref: string; code: string; message: string };

/** `ok` holds the refs that were accepted — the same refs `failed` reports on. */
export type BatchResult = { ok: string[]; failed: ItemFailure[] };

export type ExternalOrderLine = { sku: string; qty: number; unitPriceCents: number };

export type ExternalOrder = {
  /** The channel's id for the order. Half of the (channelId, externalId) guard. */
  externalId: string;
  placedAt: Date;
  customerName: string;
  currency: string;
  totalCents: number;
  lines: ExternalOrderLine[];
};

/**
 * `next` is absent when the feed is caught up. It is the caller's job to write it
 * to `Channel.cursor` only once the page has committed — see invariant 4.
 */
export type OrderPage = { orders: ExternalOrder[]; next?: string };

export const WEBHOOK_EVENT_TYPES = ['order.created', 'order.updated', 'order.cancelled'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookEvent = {
  type: WebhookEventType;
  externalId: string;
  occurredAt: Date;
  /** Present when the channel sends the order with the notification rather than a bare id. */
  order?: ExternalOrder;
};

export interface ChannelAdapter {
  readonly kind: ChannelKind;
  /**
   * How many items this channel accepts in one catalog call. It belongs to the
   * adapter rather than to the service because 50 is MockShop A's rule, not
   * OrderHub's — the service chunks by whatever the adapter says.
   */
  readonly batchLimit: number;

  pushCatalog(items: CatalogItem[]): Promise<BatchResult>;
  pullOrders(cursor?: string): Promise<OrderPage>;

  /**
   * Both halves of webhook trust, split on purpose: `verifyWebhook` answers
   * "did this really come from the channel", `parseWebhook` answers "what does
   * it say". Nothing may parse a payload it has not verified.
   */
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  parseWebhook(payload: unknown): WebhookEvent;
}

/** `Channel.credentials` is jsonb, so it arrives as an unknown bag. */
export type ChannelCredentials = Record<string, unknown>;

/**
 * A missing credential is a misconfiguration, not a channel failure, and it says
 * which channel and which key so the fix does not need a debugger.
 */
export function credential(
  credentials: ChannelCredentials,
  key: string,
  fallback?: string,
): string {
  const value = credentials[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (fallback) return fallback;
  throw new AppError('CHANNEL_ERROR', `This channel is missing its "${key}" credential.`);
}
