import { z } from 'zod';
import { hash32, seeded } from './prng';

/**
 * MockShop B — a second marketplace, and a deliberately worse-behaved one.
 *
 * Like `src/mock/a.ts` this is a third party that happens to live in the same
 * repository, and nothing here imports a service, a schema or a type from
 * `src/server`. Where A is polite, B is the integration you actually get:
 *
 *  - Basic auth against a client id and secret, not a bespoke key header
 *  - its own error envelope, `{ status: "ERROR", fault: { code, detail } }`
 *  - everything wrapped in `result`, not returned at the top level
 *  - dates as `dd/MM/yyyy HH:mm:ss` in Singapore time, with no offset in the
 *    string — the caller is expected to have read the docs
 *  - money as decimal strings, not minor units
 *  - a catalog that takes ten listings per call and answers in two groups
 *    rather than one result per item
 *  - ten requests a minute, then 429 with `Retry-After`
 *  - roughly one call in twenty fails with a 500
 *
 * None of that is cruelty for its own sake: every line of it is a mapping, a
 * retry or a backoff that the adapter has to own, so that nothing above
 * `src/server/channels/mock-b.ts` ever hears about any of it.
 */

export const BATCH_LIMIT = 10;
export const PAGE_SIZE_MAX = 50;
export const RATE_LIMIT_PER_MINUTE = 10;

/** Matches what the seed writes onto the channel row, so a fresh clone just works. */
export const clientId = (): string => process.env.MOCK_B_CLIENT_ID ?? 'mock-b-client';
export const clientSecret = (): string => process.env.MOCK_B_CLIENT_SECRET ?? 'mock-b-secret-key';
export const webhookSecret = (): string => process.env.MOCK_B_WEBHOOK_SECRET ?? 'mock-b-secret';

// --- B's own envelopes --------------------------------------------------------

export const ok = <T>(result: T): Response => Response.json({ status: 'OK', result });

export const fail = (
  status: number,
  code: string,
  detail: string,
  headers?: Record<string, string>,
): Response => Response.json({ status: 'ERROR', fault: { code, detail } }, { status, headers });

// --- auth ---------------------------------------------------------------------

/** The client id on a valid request, or the refusal to send back instead. */
function authenticate(request: Request): { clientId: string } | { response: Response } {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) {
    return { response: fail(401, 'NO_CREDENTIALS', 'Authenticate with HTTP Basic.') };
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  if (decoded !== `${clientId()}:${clientSecret()}`) {
    return { response: fail(401, 'BAD_CREDENTIALS', 'Unknown client id or secret.') };
  }

  const separator = decoded.indexOf(':');
  return { clientId: separator < 0 ? decoded : decoded.slice(0, separator) };
}

// --- rate limit ---------------------------------------------------------------

/**
 * Ten calls a minute, per client, counted in a fixed window.
 *
 * In memory, which is the one shortcut a fake is entitled to: a new serverless
 * instance starts the minute over, and nothing here is the system of record.
 * The interesting half of this limit is on the other side — milestone 6's token
 * bucket, which has to slow *us* down so that this never answers 429 at all.
 *
 * A fixed window rather than a sliding one, so `Retry-After` can be an honest
 * number: the window ends when it ends, and that is exactly how long to wait.
 */
const windows = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 60_000;

function rateLimit(key: string, now = Date.now()): number | null {
  const window = windows.get(key);
  if (!window || now - window.startedAt >= WINDOW_MS) {
    windows.set(key, { startedAt: now, count: 1 });
    return null;
  }

  window.count += 1;
  if (window.count <= RATE_LIMIT_PER_MINUTE) return null;
  return Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000));
}

// --- injected failure ---------------------------------------------------------

/**
 * Roughly one call in twenty is a 500.
 *
 * Keyed off a counter rather than `Math.random` for the reason in prng.ts, but
 * deliberately off the *call number* rather than off the request: a fault that
 * were a function of the URL would make one page of the feed permanently
 * unreadable, and a retry that can never succeed is not a retry path. The same
 * sequence of calls fails in the same places on every machine, and the call
 * after a failure is fine — which is what makes the adapter's two retries the
 * difference between a readable sync log and a noisy one.
 */
let calls = 0;

function faulted(): boolean {
  calls += 1;
  return hash32(`mock-b-call-${calls}`) % 20 === 0;
}

/**
 * Everything B does to a request before it reads it. Order matters: credentials
 * first, because an anonymous caller has no quota to spend, and the injected
 * fault last, because a service that is down is still down after it has counted
 * your request against your limit.
 */
export function guard(request: Request): Response | null {
  const authenticated = authenticate(request);
  if ('response' in authenticated) return authenticated.response;

  const retryAfter = rateLimit(authenticated.clientId);
  if (retryAfter !== null) {
    return fail(
      429,
      'RATE_LIMIT_EXCEEDED',
      `This client may make ${RATE_LIMIT_PER_MINUTE} requests per minute.`,
      { 'retry-after': String(retryAfter) },
    );
  }

  if (faulted()) {
    return fail(500, 'UPSTREAM_UNAVAILABLE', 'A downstream service is temporarily unavailable.');
  }

  return null;
}

/**
 * The webhook dispatcher authenticates but is neither counted nor faulted: it is
 * the button that demonstrates the receiver, and a demo whose demonstration
 * fails one time in twenty teaches the wrong lesson.
 */
export const authorize = (request: Request): Response | null => {
  const authenticated = authenticate(request);
  return 'response' in authenticated ? authenticated.response : null;
};

// --- B's spellings ------------------------------------------------------------

/**
 * Singapore time, written without an offset because B's docs say "all timestamps
 * are local time" and leave it there. Singapore has never observed DST, which is
 * the only reason a fixed offset is an honest simplification rather than a bug
 * waiting for March.
 */
const OFFSET_MINUTES = 480;

const pad = (value: number): string => String(value).padStart(2, '0');

export function formatTimestamp(date: Date): string {
  const local = new Date(date.getTime() + OFFSET_MINUTES * 60_000);
  return (
    `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}` +
    ` ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
  );
}

/** Minor units are OrderHub's idea, not B's: B quotes prices the way a human writes them. */
export const formatAmount = (cents: number): string =>
  `${Math.floor(cents / 100)}.${pad(cents % 100)}`;

// --- catalog ------------------------------------------------------------------

export const listingUpsertBody = z.object({
  listings: z.array(
    z.object({
      sku_code: z.string().min(1).max(64),
      name: z.string().min(1),
      price: z.string(),
      currency_code: z.string().length(3),
      // A list of pairs rather than an object. Nothing is gained by it, which is
      // precisely why an integration meets it so often.
      attributes: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
    }),
  ),
});
export type ListingUpsertBody = z.infer<typeof listingUpsertBody>;
export type ListingPayload = ListingUpsertBody['listings'][number];

export type RejectedListing = { ref: string; reason_code: string; reason: string };

export type UpsertResponse = {
  batch_reference: string;
  accepted: string[];
  rejected: RejectedListing[];
};

/** The categories B carries. It does not sell kitchenware, and says so per item. */
const LISTED_CATEGORIES = ['AUD', 'BAG', 'DSK', 'LGT', 'PWR'];

const PRICE_PATTERN = /^\d+\.\d{2}$/;

function reject(listing: ListingPayload, seen: Set<string>): Omit<RejectedListing, 'ref'> | null {
  if (!PRICE_PATTERN.test(listing.price)) {
    return { reason_code: 'PRICE_FORMAT', reason: 'price must be a decimal with exactly two places' };
  }
  if (!LISTED_CATEGORIES.includes(listing.sku_code.split('-')[0])) {
    return { reason_code: 'CATEGORY_NOT_LISTED', reason: 'this marketplace does not carry that category' };
  }
  if (seen.has(listing.sku_code)) {
    return { reason_code: 'DUPLICATE_IN_BATCH', reason: 'the same sku_code appears twice in one call' };
  }
  return null;
}

/**
 * Two groups, not one result per item.
 *
 * A caller that assumed the answers came back in the order it sent them — as
 * MockShop A's do — has to learn to match on the reference instead, which is the
 * only thing either marketplace actually promises.
 */
export function reviewListings(listings: ListingPayload[]): UpsertResponse {
  const seen = new Set<string>();
  const accepted: string[] = [];
  const rejected: RejectedListing[] = [];

  for (const listing of listings) {
    const refusal = reject(listing, seen);
    seen.add(listing.sku_code);
    if (refusal) rejected.push({ ref: listing.sku_code, ...refusal });
    else accepted.push(listing.sku_code);
  }

  return {
    batch_reference: `bref-${hash32(listings.map((listing) => listing.sku_code).join('|')).toString(16)}`,
    accepted,
    rejected,
  };
}

// --- orders -------------------------------------------------------------------

/**
 * A fixed universe again, but read by time rather than by position: B's feed is
 * "everything placed after this moment", and its page token is the timestamp of
 * the last order it handed over.
 *
 * The references overlap the MockShop B orders the seed writes, so a first pull
 * against a seeded database meets orders it already has — the case the unique
 * index on (channelId, externalId) exists to survive, met for real rather than
 * only in a test.
 */
const UNIVERSE = 240;
const EPOCH = new Date('2026-09-18T12:00:00Z');
const HOURS_BETWEEN_ORDERS = 3;

const LISTINGS = [
  { code: 'AUD', values: ['BLACK', 'SAND', 'SLATE'] },
  { code: 'BAG', values: ['18L', '24L', '32L'] },
  { code: 'DSK', values: ['OAK', 'WALNUT', 'ASH'] },
  { code: 'LGT', values: ['2700K', '4000K'] },
  { code: 'PWR', values: ['5000MAH', '10000MAH', '20000MAH'] },
] as const;

const FIRST_NAMES = ['Aksel', 'Bo', 'Cai', 'Dita', 'Emre', 'Fen', 'Goro', 'Ida', 'Jonas', 'Kira'];
const LAST_NAMES = ['Aziz', 'Bergen', 'Cheng', 'Duarte', 'Ek', 'Farag', 'Grimm', 'Halim'];

/** B's own status vocabulary. The connector reads the field and maps none of it — see mock-b.ts. */
const STATES = ['CONFIRMED', 'PICKING', 'DISPATCHED'] as const;

export type OrderPayload = {
  order_reference: string;
  created_on: string;
  state: string;
  currency_code: string;
  amount_total: string;
  buyer: { display_name: string };
  line_items: { item_code: string; units: number; unit_amount: string }[];
};

const timeOf = (index: number): Date =>
  new Date(EPOCH.getTime() - (UNIVERSE - 1 - index) * HOURS_BETWEEN_ORDERS * 3_600_000);

export function orderAt(index: number): OrderPayload {
  const random = seeded(`mock-b-order-${index}`);

  const lines = Array.from({ length: random.int(1, 3) }, () => {
    const listing = random.pick(LISTINGS);
    // The OrderHub catalog deals 50 products round-robin across six categories,
    // so a category's product numbers are every sixth one. B carries five of the
    // six, and some of the SKUs it sells are listings OrderHub has never heard
    // of — which is the normal case for a marketplace, not an error.
    const productNumber = 1001 + LISTINGS.indexOf(listing) + 6 * random.int(0, 8);
    return {
      item_code: `${listing.code}-${productNumber}-${random.pick(listing.values)}`,
      units: random.int(1, 3),
      unitCents: random.int(9, 249) * 100 + 99,
    };
  });

  const totalCents = lines.reduce((sum, line) => sum + line.units * line.unitCents, 0);

  return {
    order_reference: `ORD-B-${770_000 + index}`,
    created_on: formatTimestamp(timeOf(index)),
    state: random.pick(STATES),
    currency_code: 'USD',
    amount_total: formatAmount(totalCents),
    buyer: { display_name: `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}` },
    line_items: lines.map((line) => ({
      item_code: line.item_code,
      units: line.units,
      unit_amount: formatAmount(line.unitCents),
    })),
  };
}

export const orderListQuery = z.object({
  page_token: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(25),
});

/**
 * Where a token lands in the feed, or null if it is not a timestamp at all.
 *
 * Unlike MockShop A, which starts from the beginning when it cannot read a
 * cursor, B refuses. Both behaviours exist in the wild; refusing is the one that
 * tells a caller its cursor is corrupt instead of silently replaying a year.
 */
export function indexFromToken(token: string | undefined): number | null {
  if (!token) return 0;

  const at = Date.parse(token);
  if (Number.isNaN(at)) return null;

  // Orders are evenly spaced, so the first one after a moment is arithmetic
  // rather than a scan. `floor(...) + 1` is what makes the bound exclusive: a
  // token equal to an order's own timestamp returns the order after it.
  const steps = (EPOCH.getTime() - at) / (HOURS_BETWEEN_ORDERS * 3_600_000);
  const start = Math.floor(UNIVERSE - 1 - steps) + 1;
  return Math.min(Math.max(start, 0), UNIVERSE);
}

export function ordersPage(start: number, pageSize: number) {
  const end = Math.min(start + pageSize, UNIVERSE);
  const orders = Array.from({ length: Math.max(0, end - start) }, (_, offset) =>
    orderAt(start + offset),
  );

  return {
    orders,
    paging: {
      // The position after the last order handed over, in UTC ISO — B's cursor
      // is machine-readable even though its payload dates are not, a combination
      // real APIs arrive at more often than anyone would design. It is returned
      // on the last page too: a caller that stopped at `more: false` without
      // recording where it got to would re-read that page forever.
      next_page_token: orders.length > 0 ? timeOf(end - 1).toISOString() : null,
      more: end < UNIVERSE,
    },
  };
}

// --- webhooks -----------------------------------------------------------------

export const NOTIFICATION_KINDS = ['ORDER_PLACED', 'ORDER_AMENDED', 'ORDER_VOIDED'] as const;

export const dispatchBody = z.object({
  kind: z.enum(NOTIFICATION_KINDS).default('ORDER_PLACED'),
  /** Which order from the universe to talk about. Defaults to the newest. */
  orderIndex: z.coerce.number().int().min(0).max(UNIVERSE - 1).default(UNIVERSE - 1),
  /** Where to deliver. Defaults to the URL OrderHub registered with this channel. */
  target: z.url().optional(),
});

export const notificationPayload = (kind: string, index: number) => ({
  notification: {
    kind,
    dispatched_at: formatTimestamp(new Date()),
    order: orderAt(index),
  },
});
