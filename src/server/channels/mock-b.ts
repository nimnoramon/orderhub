import { ChannelKind } from '@/generated/prisma/enums';
import { appBaseUrl } from '@/lib/app-url';
import { verifySignature, withinTolerance } from '@/lib/hmac';
import { AppError } from '@/server/http/errors';
import {
  credential,
  type BatchResult,
  type CatalogItem,
  type ChannelAdapter,
  type ChannelCredentials,
  type OrderPage,
  type WebhookEvent,
} from './adapter';
import { toBatchResult, toListingPayload, toOrderPage, toWebhookEvent } from './mock-b-mapping';
import { ChannelHttpError, requestJson } from './transport';

/**
 * The MockShop B connector.
 *
 * Everything B-shaped stops here or in `mock-b-mapping.ts`: its Basic auth, its
 * paths, its ten-a-minute limit, its habit of failing one call in twenty. The
 * service above calls the same four methods it calls on MockShop A and cannot
 * tell the two apart — which is the only evidence that the interface was worth
 * having, and the reason this milestone builds a second adapter rather than a
 * second feature.
 *
 * It shares no code with `src/mock/b.ts`. The two sides know each other only
 * through the HTTP contract restated here and in the mapping module, exactly as
 * they would if B were a company with a PDF.
 */

// B's documented limits and paths. Copied from "the docs", not imported.
const BATCH_LIMIT = 10;
const PAGE_SIZE = 25;
const CATALOG_PATH = '/api/mock/b/listing/upsert';
const ORDERS_PATH = '/api/mock/b/order/list';
const LABEL = 'MockShop B';

/**
 * Two retries on a 5xx, which is what makes B's one-in-twenty failure a
 * non-event. Both calls this connector makes are safe to repeat: the order feed
 * is a read, and `listing/upsert` is keyed by `sku_code` and documented as
 * idempotent. Nothing else here may borrow this number without that being true.
 */
const RETRIES = 2;

export class MockShopBAdapter implements ChannelAdapter {
  readonly kind = ChannelKind.mock_b;
  readonly batchLimit = BATCH_LIMIT;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(credentials: ChannelCredentials) {
    this.clientId = credential(credentials, 'clientId', process.env.MOCK_B_CLIENT_ID);
    this.clientSecret = credential(credentials, 'clientSecret', process.env.MOCK_B_CLIENT_SECRET);
    this.webhookSecret = credential(
      credentials,
      'webhookSecret',
      process.env.MOCK_B_WEBHOOK_SECRET,
    );
    this.baseUrl = appBaseUrl();
  }

  private headers(): Record<string, string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`, 'utf8').toString('base64');
    return { 'content-type': 'application/json', authorization: `Basic ${basic}` };
  }

  /**
   * One call to B, with its 429 translated on the way out.
   *
   * A rate limit is not a channel error: the request was fine, the channel is
   * fine, and the only thing wrong is the pace we set. Saying so with a distinct
   * code is what lets the sync log show "we were going too fast" rather than "the
   * marketplace is broken", and gives milestone 6's token bucket something to
   * point at when it explains why it exists. `retryAfterSeconds` travels with it
   * because it is the one piece of advice worth keeping.
   */
  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    try {
      return await requestJson(LABEL, `${this.baseUrl}${path}`, {
        ...init,
        headers: this.headers(),
        retries: RETRIES,
      });
    } catch (error) {
      if (error instanceof ChannelHttpError && error.status === 429) {
        const wait = error.retryAfterSeconds;
        throw new AppError(
          'RATE_LIMITED',
          `${LABEL} is rate limiting this channel${wait ? `; it asked for ${wait}s` : ''}.`,
          { retryAfterSeconds: wait ?? null },
        );
      }
      throw error;
    }
  }

  async pushCatalog(items: CatalogItem[]): Promise<BatchResult> {
    if (items.length > this.batchLimit) {
      // The caller chunks by `batchLimit`; reaching here is our bug, not B's,
      // and it is worth saying so rather than letting B answer BATCH_TOO_LARGE.
      throw new AppError(
        'CHANNEL_ERROR',
        `${LABEL} accepts ${this.batchLimit} listings per call; the caller passed ${items.length}.`,
      );
    }

    const body = await this.call(CATALOG_PATH, {
      method: 'POST',
      body: JSON.stringify(toListingPayload(items)),
    });

    return toBatchResult(body, items.map((item) => item.sku));
  }

  async pullOrders(cursor?: string): Promise<OrderPage> {
    const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (cursor) query.set('page_token', cursor);

    return toOrderPage(await this.call(`${ORDERS_PATH}?${query}`));
  }

  verifyWebhook(headers: Headers, rawBody: string): boolean {
    // B counts milliseconds where A counts seconds. The signed string uses the
    // number as B wrote it; the replay window is in seconds either way.
    const timestamp = Number(headers.get('x-mockb-ts'));
    if (!Number.isFinite(timestamp)) return false;
    if (!withinTolerance(Math.floor(timestamp / 1000))) return false;

    return verifySignature(
      this.webhookSecret,
      rawBody,
      timestamp,
      headers.get('x-mockb-sig'),
      'base64',
    );
  }

  parseWebhook(payload: unknown): WebhookEvent {
    return toWebhookEvent(payload);
  }
}
