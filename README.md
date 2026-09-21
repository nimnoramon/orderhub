# OrderHub

A miniature omnichannel order hub: a product/stock/order core, two mock marketplace
connectors, and an admin dashboard — built to demonstrate the integration patterns
behind real multi-channel commerce.

Work in progress. The full README, with architecture and ER diagrams and the
design-decision write-ups, is written at milestone 7; the spec it is being built
from is in [OrderHub Build Brief.md](OrderHub%20Build%20Brief.md), and the working
rules are in [CLAUDE.md](CLAUDE.md).

## What works so far

**Products & stock** (`/products`) — product list with search and status filter,
product detail with stock per warehouse, the movement ledger behind it, and an
adjustment dialog that writes a movement with a reason.

```
GET  /api/products?query=&status=&page=     POST /api/products
GET  /api/products/:id
GET  /api/stock?warehouseId=                POST /api/stock/movements
```

Two things in there are the point of the project:

- **Stock on hand is never stored.** It is `SUM(delta)` grouped by
  `(variantId, warehouseId)` over an append-only ledger, derived in one pure
  module — `src/server/stock/levels.ts`. Product detail feeds it raw movements;
  list views feed it rows Postgres has already summed with `GROUP BY`. Summing a
  set that is already one row per pair returns that row, so the SQL aggregation
  is an optimisation rather than a second implementation of the arithmetic.
- **Adjustments cannot silently oversell.** A manual adjustment that would drive
  a pair below zero is refused, and because there is no quantity row to lock, the
  check and the insert share a transaction-scoped Postgres advisory lock keyed on
  the pair. Five concurrent removals of 50 against a level of 157 commit three
  and reject two.

Tested: `tests/stock-levels.test.ts` — negatives, multiple warehouses, movements
that net to zero, pairs with no movements at all, and the equivalence between raw
and pre-aggregated rows.

**Orders & the state machine** (`/orders`) — order list with status, channel,
date-range and search filters, and order detail with items, totals, the status
timeline and the transition actions.

```
GET  /api/orders?status=&channelId=&from=&to=&query=&page=
GET  /api/orders/:id
POST /api/orders/:id/transition             -> { to: "packed" }, 409 on an illegal move
```

- **One place decides.** `src/server/orders/state-machine.ts` holds the table —
  `created → paid|cancelled`, `paid → packed|cancelled`, `packed → shipped`, with
  `shipped` and `cancelled` terminal — and the service, the 409 and the greyed-out
  buttons all come from it. The module is pure, no Prisma and no Next, which is
  what lets the client bundle import it instead of keeping a second copy of the
  rules that drifts.
- **A transition is a compare-and-set.** The row moves only if it is still where
  it was read, inside the transaction that writes the timeline event and the stock
  movements. Two clicks on "Mark paid" produce one event and one set of movements;
  the second caller is told what happened. Stock leaves on payment and, if a paid
  order is cancelled, the order's own sale rows are read and inverted so it
  returns to the shelf it left from.

Tested: `tests/order-state-machine.test.ts` — every legal transition, and all 25
status pairs asserted against a hand-written list, so no illegal move can be
introduced by widening the table.

**Channels, sync and webhooks** (`/channels`, `/sync-log`) — two marketplace
connectors behind one interface, catalog push, idempotent order pull, the webhook
receiver, and the log every run lands in.

```
GET  /api/channels
POST /api/channels/:id/sync/catalog         -> runs the push, answers with the job
POST /api/channels/:id/sync/orders          -> reads the feed, answers with the job
GET  /api/sync-jobs?channelId=&status=&type=&page=
POST /api/webhooks/:kind?token=             -> verify token, then signature, then apply

POST /api/mock/a/catalog/batch              -> MockShop A: <=50 items, per-item results
GET  /api/mock/a/orders?cursor=&limit=      -> MockShop A: cursor-paginated feed
POST /api/mock/a/webhooks/send              -> MockShop A: an HMAC-signed delivery

POST /api/mock/b/listing/upsert             -> MockShop B: <=10 listings, answered in groups
GET  /api/mock/b/order/list?page_token=     -> MockShop B: a feed read by watermark
POST /api/mock/b/hooks/dispatch             -> MockShop B: base64 signature, ms timestamp
```

- **`partial` is a first-class outcome.** A batch API fails per item, not per
  request: MockShop A answers `200` with a result for each of the 50 listings it
  was sent, and a run where 81 landed and 6 were rejected is `partial` — not
  `failed`, which would throw away the 81 and invite a retry that pushes them
  again, and not `succeeded`, which would hide the 6. The rule is one pure
  function in `src/server/sync/runner.ts`; nothing succeeding at all is `failed`,
  because there is nothing partial about it. A batch that fails as a whole — the
  connection dropped, the key was rejected — records its items as failed and the
  next batch is still attempted, so the counts stay counts of items.
- **The connector and the marketplace share nothing but HTTP.** MockShop A is a
  route in this same deployment and could have been imported as a function.
  Reaching it with `fetch`, an API key and a timeout is what makes the mapping,
  the response validation and the failure handling real code: `src/mock/` speaks
  `price_cents`, `options` and `{ ok: false, error_code }`, and none of that
  exists above `src/server/channels/mock-a.ts`. The adapter *validates* what the
  channel returns rather than casting it — a channel is the one input that is
  neither the user nor us.
- **The fake is deterministic.** Which SKUs MockShop A rejects is a hash of the
  SKU, and order *n* of either feed is always the same order, so the sync log is
  reproducible, the screenshots stay true, and re-reading a cursor returns what
  it returned before — which is what makes the idempotency test mean something.
- **Two marketplaces, one interface, nothing shared.** MockShop B disagrees with
  A about everything an integration can disagree about: Basic auth instead of a
  key header, `order_reference` instead of `id`, `17/09/2026 22:00:00` in
  Singapore time instead of ISO UTC, `"349.70"` instead of `34970`, ten listings
  a call instead of fifty, answers grouped into accepted and rejected instead of
  one result per item, and a feed paginated by watermark instead of by an opaque
  id. All of it stops in `src/server/channels/mock-b-mapping.ts`; the service
  above calls the same four methods and cannot tell the two channels apart. The
  adapter and the mock share no schema, no type and no constant — each restates
  the wire format, exactly as it would if B were a company with a PDF.
- **Idempotency is the database's job.** Re-pulling a page must not create a
  second copy of an order, and the guard is `unique(channelId, externalId)` plus
  an insert that treats a `P2002` as "already have it" — never a `findFirst` then
  a `create`, where two concurrent pulls both see nothing and both insert. The
  cursor is the other half: it advances only once a whole page has been written,
  so a run that dies mid-page reads that page again rather than stepping over the
  orders it never wrote. At-least-once delivery is safe only because both halves
  are there.
- **A rate limit and a flaky 500 are different problems.** MockShop B fails
  roughly one call in twenty and refuses more than ten a minute. The transport
  retries a 5xx twice, with backoff, on the two calls the channel documents as
  safe to repeat — so the 500 never reaches the sync log. It deliberately does
  *not* retry a 429: the channel has just said it is being asked too often, and
  asking again 200ms later is the one answer guaranteed to be wrong. That is
  recorded as `RATE_LIMITED` with the `Retry-After` it sent, and slowing down
  before it happens is the token bucket below.
- **A webhook is trusted in three steps.** The verify token in the URL says this
  is a URL we handed out, the HMAC over `timestamp.body` says the channel really
  sent these bytes, and only then is the payload parsed. The body is read as
  text, never re-serialised — signing a re-encoded object passes locally, where
  both ends are the same JSON encoder, and fails against every real marketplace.
  Delivery that cannot be applied — a cancellation of an order already shipped —
  is answered `200` with a reason, because a 4xx would make the channel redeliver
  it every few minutes for a day.

Tested: `tests/catalog-batch.test.ts` — the per-item rules, the adapter's reading
of a batch response over a stubbed transport, and all four outcomes of the status
rule. `tests/webhook-signature.test.ts` — sign/verify round trip, wrong secret,
a body changed by one character, a signature moved to a fresh timestamp, and the
adapter verifying a delivery the mock actually signed.
`tests/channel-mapping.test.ts` — MockShop B's dates across the date boundary and
in the day/month order it invites getting wrong, its decimal money without a
float in sight, its grouped batch answer, and a listing it never answered for.
`tests/order-pull-idempotency.test.ts` — the real ingest path against a fake table
that enforces the real unique constraint: a page read twice writes 25 rows and
then none, a page that only half wrote leaves the cursor alone and replays whole,
and a rate-limited second page ends the run `partial` rather than `failed`.

**Redis: pacing, retrying, and one cached read** — a token bucket per channel, a
retry queue for catalog items, and a 60-second cache on the summary the overview
screen will read.

```
POST /api/channels/:id/sync/retries         -> pushes only what the queue says is due
GET  /api/dashboard/summary                 -> cached 60s, x-cache: HIT|MISS
```

- **A limiter that makes the retry queue necessary.** MockShop B allows ten
  requests per fixed minute. A token bucket refills smoothly, so the only way one
  stays inside a fixed window is `capacity + refillPerMinute <= limit` — B's
  connector uses 6 + 4, and `tests/token-bucket.test.ts` drives the real
  algorithm for two simulated hours to prove no sixty-second span ever holds
  eleven. The honest consequence is that a full catalog push — about nine batches
  — does not fit in one run's budget. Loosening the numbers so it would means
  choosing to earn the 429s the limiter exists to avoid, so instead the run ends
  `partial` and the items it never sent go to the queue. A token is spent before
  every attempt, retries included, because a retry is a request the marketplace
  counts like any other. MockShop A publishes no limit and gets a courtesy cap:
  an undocumented limit is still a limit, and hammering the endpoint is how
  integrations find out what it was.
- **The queue holds references, not payloads.** A queued entry is a SKU and an
  attempt count; when the retry runs, the variant is read from Postgres again at
  its current title and price. Enqueuing the item itself would be faster and
  would push a four-minute-old price because that is what the queue happened to
  be holding. Redis owns the schedule, Postgres owns the truth.
- **Only some failures are worth repeating.** A listing MockShop B rejected
  because it does not carry that category will be rejected identically in fifteen
  seconds, in thirty, and in four minutes. So the queue takes failures whose code
  is *ours* — unreachable, 5xx, out of budget, our own bug — and leaves the
  channel's per-item verdicts in the job's error list where a human can read
  them. Backoff is 15s doubling to 4m with ±20% jitter, five attempts, then the
  item is abandoned and the log says so. The delay is short because this is a
  demo somebody clicks through; production would start at a minute.
- **The retry run is a `catalog_push` with `attempt > 1`.** No new job type and
  no new table: `SyncJob.attempt` has been in the schema since milestone 1 and
  this is what it was for. A retry pushes only the due items, which is the whole
  point — re-listing ninety items to fix three would spend the channel's entire
  minute.
- **The cache is dropped by four writes, not by a hook.** A status change, an
  order arriving from a channel, a stock movement and a finished sync each
  invalidate the summary, after the transaction rather than inside it. Four call
  sites is a list a reader can check against the summary's own fields; a Prisma
  middleware that fired on every write would drop the cache for changes that
  alter none of these numbers and nobody could say why. The accepted race is
  stated in the code: a read that missed can finish after the delete and store a
  value computed before the change, for up to sixty seconds.
- **Redis is never the system of record.** Every call is wrapped so that an
  outage degrades a feature rather than failing a request — a limiter that cannot
  reach Redis fails *open*, because the 429 path already exists and a Redis
  outage stopping all syncing is the worse failure. With Upstash unconfigured,
  all three features fall back to in-process state and say so once at startup,
  so a fresh clone runs with nothing but a database. That fallback is correct for
  one process and wrong for several, which is why the deployed demo has Upstash.

Tested: `tests/token-bucket.test.ts` — refill in proportion to elapsed time,
capacity as a ceiling, a clock that runs backwards, the wait a refused caller is
told to expect and that waiting exactly that long is enough, and the
sixty-second-window simulation above. `tests/retry-queue.test.ts` — which codes
are worth retrying, the doubling and its jitter bounds, attempts counted across
runs until the item is abandoned, a cleared item starting its backoff over, and
due items handed back oldest first. Both run against the in-process fallback,
which is the code path a fresh clone gets.

The services, routes and UI around them are deliberately untested; the three
suites that matter are listed in [CLAUDE.md](CLAUDE.md#testing) and arrive with
the milestones they belong to.

## Run locally

Needs Node 22+, pnpm, and a PostgreSQL connection string (this project uses a
[Neon](https://neon.tech) free-tier database — there is no Docker setup).

```bash
pnpm install
cp .env.example .env          # then paste your DATABASE_URL
pnpm db:migrate               # create the schema
pnpm db:seed                  # 50 products, 200 orders, 60 days of history
pnpm dev
```

Redis is optional locally. With `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` unset, the rate limiter, the retry queue and the
dashboard cache run on in-process state and log one warning — everything works,
in one process. Set them (an [Upstash](https://upstash.com) free database takes a
minute to create) to run the way the deployment does.

Demo login: `demo@orderhub.dev` / `demo1234` — seeded and bcrypt-hashed, and
printed on the landing page. Nothing asks for it yet: the sign-in screen arrives
with the auth milestone and the dashboard is open until then.

## Deploy

Vercel for the app, [Neon](https://neon.tech) for Postgres and
[Upstash](https://upstash.com) for Redis, all three free tier. Neon runs two
branches — `dev` for the laptop and `production` (Neon's default branch) for the
deployed demo, region `ap-southeast-1`.

### 1. Neon

Copy the **pooled** connection string for the `production` branch — the host
contains `-pooler` — and make sure it ends with `?sslmode=verify-full`.

### 2. Vercel project

| Setting | Value |
|---|---|
| Framework preset | Next.js (detected) |
| Root directory | repository root |
| Install command | default `pnpm install` — its `postinstall` runs `prisma generate` |
| Build command | default `pnpm build` = `prisma generate && next build` |
| Node version | 22.x, from `engines.node` |
| Function region | `sin1`, set by `vercel.json` |

The region is not a detail. Neon lives in `ap-southeast-1`, and functions running
in Vercel's default Washington region would cross the Pacific for every query on
a page that makes several.

### 3. Environment variables

Add these to the project **before the first deploy**. The build imports
`src/server/db.ts`, which throws when `DATABASE_URL` is missing, so a project
without it fails at build rather than at runtime.

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled `production` connection string |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | the seeded login, printed on the landing page |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | the Upstash database's two values |

The connector reaches the mock marketplaces over HTTP, so it needs to know the
deployment's own origin. `APP_BASE_URL` sets it; left unset, it falls back to
Vercel's per-deployment `VERCEL_URL`, which is what you want on a preview so it
talks to itself rather than to production. The mock marketplaces' credentials —
`MOCK_A_API_KEY`, `MOCK_B_CLIENT_ID`, `MOCK_B_CLIENT_SECRET` and the two
`*_WEBHOOK_SECRET`s — default to the values the seed writes onto the channel
rows, so they only matter if you intend to change them, and then the seed has to
be run again. `WEBHOOK_VERIFY_TOKEN` is the token in the webhook URL each mock
was given; both ends fall back to the same demo value.

The two Upstash values are the only ones without a usable default: unset, the
deployment still runs, but its rate limiter and retry queue live inside whichever
instance happened to answer, which is the same as not having them. One Upstash
database serves production and every preview — keys are prefixed with
`VERCEL_ENV`, so a preview branch cannot drain production's retry queue or hand
it a stale summary.

The landing page is statically rendered, so changing either `DEMO_*` value needs
a redeploy before the card on it catches up.

### 4. Migrate and seed the production branch, from your laptop

```bash
cp .env.example .env.prod    # set DATABASE_URL to the production branch
pnpm db:deploy:prod          # prisma migrate deploy
pnpm db:seed:prod            # 3 warehouses, 50 products, 200 orders
```

`.env.prod` is gitignored by the `.env*` rule. The name is deliberate: Next.js
loads `.env.production` by itself during `next build` and `next start`, so a file
by *that* name sitting in the working tree would quietly point a local build at
the live database. Nothing loads `.env.prod` except the two scripts above, which
name it explicitly through Node's `--env-file` — and that wins over `.env`,
because dotenv never overwrites a variable that is already set. Neither script
can quietly rewrite your dev branch, and the seed prints the host it is about to
rewrite before it deletes anything.

**`db:seed:prod` is destructive**: it deletes every row in every table and writes
the demo data again. That is the point — the seed is deterministic
(`faker.seed`), so running it returns the live demo to exactly the state the
screenshots were taken in, and an empty demo reads as a broken one. Run it once
after the first `db:deploy:prod`, and again whenever the demo has been clicked
about too much.

### 5. Every deploy after the first

Push to `main`. Vercel builds from the repo; only a schema change needs
`pnpm db:deploy:prod` run again from the laptop.
