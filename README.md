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

**Channels & catalog sync** (`/channels`, `/sync-log`) — the first marketplace
connector, the interface behind it, and the log every run lands in.

```
GET  /api/channels
POST /api/channels/:id/sync/catalog         -> runs the push, answers with the job
GET  /api/sync-jobs?channelId=&status=&type=&page=

POST /api/mock/a/catalog/batch              -> MockShop A: <=50 items, per-item results
GET  /api/mock/a/orders?cursor=&limit=      -> MockShop A: cursor-paginated feed
POST /api/mock/a/webhooks/send              -> MockShop A: an HMAC-signed delivery
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
  SKU, and order *n* of its feed is always the same order, so the sync log is
  reproducible, the screenshots stay true, and re-reading a cursor returns what
  it returned before — which is what will make milestone 5's idempotency test
  mean something.

Tested: `tests/catalog-batch.test.ts` — the per-item rules, the adapter's reading
of a batch response over a stubbed transport, and all four outcomes of the status
rule. `tests/webhook-signature.test.ts` — sign/verify round trip, wrong secret,
a body changed by one character, a signature moved to a fresh timestamp, and the
adapter verifying a delivery the mock actually signed.

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

Demo login: `demo@orderhub.dev` / `demo1234` — seeded and bcrypt-hashed, and
printed on the landing page. Nothing asks for it yet: the sign-in screen arrives
with the auth milestone and the dashboard is open until then.

## Deploy

Vercel for the app, [Neon](https://neon.tech) for Postgres, both free tier. Neon
runs two branches — `dev` for the laptop and `production` (Neon's default branch)
for the deployed demo, region `ap-southeast-1`. Redis is not needed until
milestone 6.

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

The connector reaches the mock marketplaces over HTTP, so it needs to know the
deployment's own origin. `APP_BASE_URL` sets it; left unset, it falls back to
Vercel's per-deployment `VERCEL_URL`, which is what you want on a preview so it
talks to itself rather than to production. `MOCK_A_API_KEY` and
`MOCK_A_WEBHOOK_SECRET` default to the values the seed writes onto the channel
row, so they only matter if you intend to change them — and then the seed has to
be run again.

Everything else in `.env.example` belongs to milestones 5–6; leave it unset. The
landing page is statically rendered, so changing either `DEMO_*` value needs a
redeploy before the card on it catches up.

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
