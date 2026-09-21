import { z } from 'zod';
import { AppError } from '@/server/http/errors';
import type {
  BatchResult,
  CatalogItem,
  ExternalOrder,
  ItemFailure,
  OrderPage,
  WebhookEvent,
  WebhookEventType,
} from './adapter';

/**
 * Everything B-shaped, turned into OrderHub's vocabulary and back.
 *
 * This is the file CLAUDE.md means by "its own mapping layer". It is separate
 * from the adapter for two reasons: the adapter is about HTTP — credentials,
 * paths, statuses, retries — and this is about meaning, and a mapping that can
 * be tested without a fetch is one that actually gets tested. Nothing here
 * imports `src/mock/b.ts`; the wire format below is restated from B's docs, and
 * `tests/channel-mapping.test.ts` feeds it payloads written out by hand for the
 * same reason. Two sides that share a schema cannot disagree, which sounds like
 * a benefit until the day the marketplace is a real company.
 */

const LABEL = 'MockShop B';

const unreadable = (detail: string, details?: unknown): AppError =>
  new AppError('CHANNEL_ERROR', `${LABEL} ${detail}`, details);

// --- dates --------------------------------------------------------------------

/**
 * B writes `dd/MM/yyyy HH:mm:ss` in Singapore time with no offset in the string.
 * Every timestamp it sends has to be shifted here, once, or the whole app is out
 * by eight hours in a way nobody notices until a date filter drops an order.
 *
 * Fixed rather than looked up because Singapore has never observed DST — the
 * same assumption would be a bug for almost anywhere else, so it is written down
 * rather than inferred.
 */
export const B_OFFSET_MINUTES = 480;

const TIMESTAMP_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, '0');

export function parseTimestamp(value: string): Date {
  const matched = TIMESTAMP_PATTERN.exec(value);
  if (!matched) {
    throw unreadable(`sent "${value}", which is not a dd/MM/yyyy HH:mm:ss timestamp.`);
  }

  const [day, month, year, hour, minute, second] = matched.slice(1).map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - B_OFFSET_MINUTES * 60_000;

  // `Date.UTC` rolls 31/02 forward into March and 25:00 into the next day rather
  // than refusing either, so the parse is only trusted if it survives being
  // written back out. That also catches the day/month swap this format invites:
  // 03/07 is the third of July here and nowhere else in the app.
  const local = new Date(utcMs + B_OFFSET_MINUTES * 60_000);
  const written =
    `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}` +
    ` ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
  if (written !== value) throw unreadable(`sent "${value}", which is not a real moment.`);

  return new Date(utcMs);
}

// --- money --------------------------------------------------------------------

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * `"349.70"` becomes `34970`.
 *
 * Parsed as digits rather than with `parseFloat`, because `8.29 * 100` is
 * 828.9999999999999 and the rounding step that fixes it is a decision somebody
 * has to remember to make on every call site. A value with more than two
 * decimals is refused rather than rounded: a marketplace quoting tenths of a
 * cent is telling us something, and silently discarding it is how a total ends
 * up disagreeing with its lines.
 */
export function decimalToCents(value: string): number {
  const matched = AMOUNT_PATTERN.exec(value);
  if (!matched) throw unreadable(`sent an amount this connector cannot read: "${value}".`);

  const [, sign, whole, fraction = '0'] = matched;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

/** The way back, for the prices this connector sends B. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${pad(absolute % 100)}`;
}

// --- B's wire format ----------------------------------------------------------

/**
 * B's responses are validated rather than cast. A channel is the one input that
 * is neither the user nor us, and `as` would turn a change on their side into an
 * `undefined` halfway through a mapping function rather than a stated failure.
 *
 * `state` is absent below on purpose. B sends one — CONFIRMED, PICKING,
 * DISPATCHED — and this connector maps none of it: what a marketplace means by
 * "dispatched" is its own business, and translating it into our lifecycle would
 * put a second set of transition rules outside `src/server/orders/state-machine.ts`.
 * Pulled orders enter as `created` and move from there.
 */
const orderPayload = z.object({
  order_reference: z.string().min(1),
  created_on: z.string(),
  currency_code: z.string(),
  amount_total: z.string(),
  buyer: z.object({ display_name: z.string() }),
  line_items: z.array(
    z.object({ item_code: z.string(), units: z.number().int(), unit_amount: z.string() }),
  ),
});

const orderListResponse = z.object({
  status: z.literal('OK'),
  result: z.object({
    orders: z.array(orderPayload),
    paging: z.object({ next_page_token: z.string().nullable(), more: z.boolean() }),
  }),
});

const upsertResponse = z.object({
  status: z.literal('OK'),
  result: z.object({
    batch_reference: z.string(),
    accepted: z.array(z.string()),
    rejected: z.array(
      z.object({ ref: z.string(), reason_code: z.string(), reason: z.string() }),
    ),
  }),
});

const notificationBody = z.object({
  notification: z.object({
    kind: z.string(),
    dispatched_at: z.string(),
    order: orderPayload,
  }),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown, what: string): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  throw unreadable(`sent ${what} this connector cannot read.`, {
    issues: parsed.error.issues.map((issue) => issue.path.join('.')),
  });
}

// --- orders in ----------------------------------------------------------------

export function toExternalOrder(payload: z.infer<typeof orderPayload>): ExternalOrder {
  return {
    externalId: payload.order_reference,
    placedAt: parseTimestamp(payload.created_on),
    customerName: payload.buyer.display_name,
    currency: payload.currency_code,
    totalCents: decimalToCents(payload.amount_total),
    lines: payload.line_items.map((line) => ({
      sku: line.item_code,
      qty: line.units,
      unitPriceCents: decimalToCents(line.unit_amount),
    })),
  };
}

export function toOrderPage(body: unknown): OrderPage {
  const { result } = parseOrThrow(orderListResponse, body, 'a page of orders');

  return {
    orders: result.orders.map(toExternalOrder),
    // B hands back where it got to even on the last page, so the cursor can be
    // recorded there too. Being caught up then looks like an empty page, which
    // is what the puller stops on.
    next: result.paging.next_page_token ?? undefined,
  };
}

// --- catalog out and back -----------------------------------------------------

/** What B expects to be sent: decimal prices, and attributes as a list of pairs. */
export function toListingPayload(items: CatalogItem[]) {
  return {
    listings: items.map((item) => ({
      sku_code: item.sku,
      name: item.title,
      price: centsToDecimal(item.priceCents),
      currency_code: item.currency,
      attributes: Object.entries(item.attributes).map(([name, value]) => ({ name, value })),
    })),
  };
}

/**
 * B answers in two groups rather than one result per item, so the refs sent are
 * needed to check that every one of them came back. A channel that drops an item
 * from its answer would otherwise be counted as having accepted it — the failure
 * that looks like a successful sync until somebody searches the marketplace for
 * a listing that was never created.
 */
export function toBatchResult(body: unknown, sentRefs: string[]): BatchResult {
  const { result } = parseOrThrow(upsertResponse, body, 'a batch answer');

  const failed: ItemFailure[] = result.rejected.map((entry) => ({
    ref: entry.ref,
    code: entry.reason_code,
    message: entry.reason,
  }));

  const answered = new Set([...result.accepted, ...failed.map((entry) => entry.ref)]);
  const unanswered = sentRefs.filter((ref) => !answered.has(ref));
  if (unanswered.length > 0 || answered.size !== sentRefs.length) {
    throw unreadable(
      `answered for ${answered.size} of ${sentRefs.length} listings.`,
      { unanswered },
    );
  }

  return { ok: result.accepted, failed };
}

// --- webhooks -----------------------------------------------------------------

/** B's notification names, which are not ours and not A's. */
const EVENT_TYPES: Record<string, WebhookEventType> = {
  ORDER_PLACED: 'order.created',
  ORDER_AMENDED: 'order.updated',
  ORDER_VOIDED: 'order.cancelled',
};

export function toWebhookEvent(payload: unknown): WebhookEvent {
  const { notification } = parseOrThrow(notificationBody, payload, 'a notification');

  const type = EVENT_TYPES[notification.kind];
  if (!type) {
    // A notification we have no meaning for is not a malformed one. It is
    // refused here rather than guessed at, and the receiver turns that into an
    // answer the channel can read.
    throw unreadable(`sent a notification kind this connector does not handle: ${notification.kind}.`);
  }

  return {
    type,
    externalId: notification.order.order_reference,
    occurredAt: parseTimestamp(notification.dispatched_at),
    order: toExternalOrder(notification.order),
  };
}
