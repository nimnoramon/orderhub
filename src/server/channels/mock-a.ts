import { z } from 'zod';
import { ChannelKind } from '@/generated/prisma/enums';
import { appBaseUrl } from '@/lib/app-url';
import { verifySignature, withinTolerance } from '@/lib/hmac';
import { AppError } from '@/server/http/errors';
import { UNLIMITED, type Limiter } from '@/server/ratelimit/limiter';
import type { Rate } from '@/server/ratelimit/token-bucket';
import {
  WEBHOOK_EVENT_TYPES,
  credential,
  type BatchResult,
  type CatalogItem,
  type ChannelAdapter,
  type ChannelCredentials,
  type ExternalOrder,
  type OrderPage,
  type WebhookEvent,
} from './adapter';
import { requestJson } from './transport';

/**
 * The MockShop A connector.
 *
 * Everything A-shaped stops here: its header names, its `price_cents` spelling,
 * its cursor format, its `{ ok: false, error_code }` envelope. Nothing above
 * this file knows any of it.
 *
 * It shares no code with `src/mock/a.ts`. The temptation is obvious — the fake
 * marketplace is three directories away and exports the very schemas that would
 * make this file shorter — and giving in would make the adapter untestable
 * against anything but itself. The two sides know each other only through the
 * HTTP contract restated below, exactly as they would if A were a company with
 * a PDF.
 */

// A's documented limits and paths. Copied from "the docs", not imported.
const BATCH_LIMIT = 50;
const CATALOG_PATH = '/api/mock/a/catalog/batch';
const ORDERS_PATH = '/api/mock/a/orders';
const LABEL = 'MockShop A';

/**
 * A's responses are validated rather than cast. A channel is the one input that
 * is neither the user nor us, and `as` would turn a change on their side into an
 * undefined halfway through a mapping function rather than a stated failure.
 */
const batchResponse = z.object({
  results: z.array(
    z.union([
      z.object({ sku: z.string(), status: z.literal('ok'), listing_id: z.string().optional() }),
      z.object({
        sku: z.string(),
        status: z.literal('error'),
        code: z.string(),
        message: z.string(),
      }),
    ]),
  ),
});

const orderPayload = z.object({
  id: z.string(),
  placed_at: z.iso.datetime(),
  currency: z.string(),
  total_cents: z.number().int(),
  customer: z.object({ name: z.string() }),
  lines: z.array(
    z.object({ sku: z.string(), qty: z.number().int(), unit_price_cents: z.number().int() }),
  ),
});

const orderListResponse = z.object({
  orders: z.array(orderPayload),
  next_cursor: z.string().nullable(),
});

const webhookBody = z.object({
  event: z.enum(WEBHOOK_EVENT_TYPES),
  sent_at: z.iso.datetime(),
  order: orderPayload,
});

/** A's order shape, in OrderHub's vocabulary. The only mapping A needs. */
const toExternalOrder = (payload: z.infer<typeof orderPayload>): ExternalOrder => ({
  externalId: payload.id,
  placedAt: new Date(payload.placed_at),
  customerName: payload.customer.name,
  currency: payload.currency,
  totalCents: payload.total_cents,
  lines: payload.lines.map((line) => ({
    sku: line.sku,
    qty: line.qty,
    unitPriceCents: line.unit_price_cents,
  })),
});

/**
 * A courtesy limit, not a documented one.
 *
 * A publishes no rate limit, which is not the same as having none — it is an
 * undocumented one, and the way integrations discover it is by being the traffic
 * that causes it to be written down. Sixty a minute with a burst of twenty is
 * far above anything this app does in a run, so it never shapes behaviour; what
 * it does is make the limiter a property of every connector rather than a
 * special case bolted onto the one marketplace that happened to say no first.
 */
export const MOCK_A_RATE: Rate = { capacity: 20, refillPerMinute: 60 };

export class MockShopAAdapter implements ChannelAdapter {
  readonly kind = ChannelKind.mock_a;
  readonly batchLimit = BATCH_LIMIT;
  readonly rate = MOCK_A_RATE;

  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly limiter: Limiter;

  constructor(credentials: ChannelCredentials, limiter: Limiter = UNLIMITED) {
    // The seed writes both onto the channel row; the environment is the fallback
    // for a database seeded before a secret was rotated.
    this.apiKey = credential(credentials, 'apiKey', process.env.MOCK_A_API_KEY);
    this.webhookSecret = credential(
      credentials,
      'webhookSecret',
      process.env.MOCK_A_WEBHOOK_SECRET,
    );
    this.baseUrl = appBaseUrl();
    this.limiter = limiter;
  }

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', 'x-mockshop-key': this.apiKey };
  }

  /** Spent before every request, so both of A's calls are paced identically. */
  private readonly beforeAttempt = () => this.limiter.acquire();

  async pushCatalog(items: CatalogItem[]): Promise<BatchResult> {
    if (items.length > this.batchLimit) {
      // The caller chunks by `batchLimit`; reaching here is our bug, not A's, and
      // it is worth saying so rather than letting A answer TOO_MANY_ITEMS.
      throw new AppError(
        'CHANNEL_ERROR',
        `${LABEL} accepts ${this.batchLimit} items per batch; the caller passed ${items.length}.`,
      );
    }

    const body = await requestJson(LABEL, `${this.baseUrl}${CATALOG_PATH}`, {
      method: 'POST',
      headers: this.headers(),
      beforeAttempt: this.beforeAttempt,
      body: JSON.stringify({
        items: items.map((item) => ({
          sku: item.sku,
          title: item.title,
          price_cents: item.priceCents,
          currency: item.currency,
          options: item.attributes,
        })),
      }),
    });

    const { results } = batchResponse.parse(body);

    const ok: string[] = [];
    const failed = [];
    for (const result of results) {
      if (result.status === 'ok') ok.push(result.sku);
      else failed.push({ ref: result.sku, code: result.code, message: result.message });
    }

    // A answers per item and in order, but a channel that dropped an item from
    // its response would otherwise be silently counted as a success.
    const answered = ok.length + failed.length;
    if (answered !== items.length) {
      throw new AppError(
        'CHANNEL_ERROR',
        `${LABEL} answered for ${answered} of ${items.length} items.`,
      );
    }

    return { ok, failed };
  }

  async pullOrders(cursor?: string): Promise<OrderPage> {
    const url = new URL(`${this.baseUrl}${ORDERS_PATH}`);
    if (cursor) url.searchParams.set('cursor', cursor);

    const body = await requestJson(LABEL, url.toString(), {
      headers: this.headers(),
      beforeAttempt: this.beforeAttempt,
    });
    const page = orderListResponse.parse(body);

    return {
      orders: page.orders.map(toExternalOrder),
      next: page.next_cursor ?? undefined,
    };
  }

  verifyWebhook(headers: Headers, rawBody: string): boolean {
    const timestamp = Number(headers.get('x-mockshop-timestamp'));
    if (!Number.isFinite(timestamp)) return false;
    // Checked before the digest: a valid signature on an hours-old body is a
    // replay, and it is still a valid signature.
    if (!withinTolerance(timestamp)) return false;

    return verifySignature(
      this.webhookSecret,
      rawBody,
      timestamp,
      headers.get('x-mockshop-signature'),
    );
  }

  parseWebhook(payload: unknown): WebhookEvent {
    const parsed = webhookBody.safeParse(payload);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', `${LABEL} sent a webhook this connector cannot read.`, {
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const { event, sent_at: sentAt, order } = parsed.data;
    return {
      type: event,
      externalId: order.id,
      occurredAt: new Date(sentAt),
      order: toExternalOrder(order),
    };
  }
}
