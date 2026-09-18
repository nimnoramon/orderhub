# OrderHub

A miniature omnichannel order hub: product/stock/order core, two mock marketplace
connectors, and an admin dashboard. Public portfolio demo — own code, fake data.

The full spec lives in [OrderHub Build Brief.md](OrderHub%20Build%20Brief.md).
This file is the short version plus the rules that are easy to break.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Prisma 7 + PostgreSQL (Neon)
· Redis (Upstash, from milestone 6) · Vitest · pnpm

Prisma 7 runs through a driver adapter (`@prisma/adapter-pg`), not a Rust engine.
The generated client is TypeScript under `src/generated/prisma` and is gitignored;
`pnpm install` regenerates it.

## Layout

```
app/                 routes and API routes only
  api/**/route.ts    parse -> authenticate -> call a service -> map to HTTP
  api/mock/a|b/      the mock marketplaces, same app, deliberately awkward
src/server/          all business logic and the only code that touches the DB
  services/          products, stock, orders, channels, sync, dashboard
  orders/            state-machine.ts
  channels/          adapter.ts + one adapter per channel + registry
  sync/              job runner, retry queue
  ratelimit/         token bucket
  http/              handler + error -> status mapping, in one place
src/lib/             types, zod schemas, money and date helpers (shared both sides)
src/components/      UI
prisma/              schema, migrations, seed
tests/               the three suites that matter (see Testing)
```

Import alias: `@/*` resolves to `src/*`.

## Invariants

These are the decisions the project exists to demonstrate. Breaking one silently
is worse than not building the feature.

1. **`StockMovement` is append-only.** Never `UPDATE`, never `DELETE`. A
   correction is a new row with a negative `delta` and a `reason`.
2. **Stock on hand is always derived**: `SUM(delta)` grouped by
   `(variantId, warehouseId)`. There is no `qty` column anywhere, and there must
   never be one. (If reads ever need it, the answer is a `StockLevel` table
   updated in the same transaction with `SET qty = qty + $delta` — not a cached
   number written from application code.)
3. **Orders are unique per `(channelId, externalId)`** and the database enforces
   it. Sync writes orders with `upsert` on that compound key and treats a
   `P2002` as "already have it". Never `findFirst` then `create` — two concurrent
   pulls both see nothing and both insert.
4. **`Channel.cursor` advances only after a whole page has committed.** A crash
   mid-page replays the page; invariant 3 makes the replay harmless. That pairing
   is what makes at-least-once delivery safe.
5. **Transitions are decided in `src/server/orders/state-machine.ts` and nowhere
   else.** `created → paid|cancelled`, `paid → packed|cancelled`,
   `packed → shipped`; `shipped` and `cancelled` are terminal. Anything else is a
   409 with a readable body. The UI greys out buttons by calling the same
   function — it does not keep its own copy of the rules.
6. **A `SyncJob` can end `partial`.** Batch APIs fail per item, so per-item
   failures go in `errorSummary` and the job is `partial`, not `failed`.
7. **`app/` never imports `prisma`.** Route handlers and pages go through
   `src/server/services/*`. This is what keeps the honest answer to "why not
   NestJS?" true: the service layer would lift out unchanged.

## Conventions

- **Money is integer minor units** (`priceCents`, `totalCents`, `unitPriceCents`)
  all the way to the edge; format only when rendering, via `src/lib/money.ts`.
  Not `Decimal` — it does not survive the server/client component boundary.
- **Dates are UTC ISO strings in API payloads**; format in the component.
- **Validation is zod, in `src/lib/schemas/`**, shared by the route handler and
  the client form. The handler parses; the service takes typed input and trusts it.
- **Errors**: services throw `AppError` (with a code); `src/server/http/` maps
  code → status in one place. Never `throw new Error` for something the client
  should see, and never build a `NextResponse` inside a service.
- `externalId` is nullable for storefront orders. Postgres treats NULLs as
  distinct, so the unique index does not collide on them — this is deliberate.
- Comments explain *why*. Do not write comments that restate the code.

## Testing

Only three suites are required, and they are the three an interviewer will ask
about:

1. `tests/stock-levels.test.ts` — level derivation: negatives, multiple
   warehouses, movements that net to zero.
2. `tests/order-state-machine.test.ts` — every legal and every illegal
   transition.
3. `tests/order-pull-idempotency.test.ts` — re-pulling the same page creates no
   duplicates.

Plus `tests/channel-mapping.test.ts` for MockShop B's field and date mapping.
Everything else can go untested; say so in the README rather than faking coverage.

## Commands

```bash
pnpm dev            # next dev
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm db:migrate     # prisma migrate dev
pnpm db:seed        # tsx prisma/seed.ts
pnpm db:reset       # drop, re-migrate, re-seed
pnpm db:studio      # browse the data
```

Database is Neon, two branches: `dev` for local work and `production` (the Neon
default branch) for the deployed demo, region `ap-southeast-1`. There is no
Docker in this setup; `.env.example` lists every variable.

The seed is deterministic (`faker.seed(20260918)`) so screenshots stay accurate,
and it always leaves the demo non-empty: 3 warehouses, 50 products, 200 orders
across 60 days and all five statuses, some low-stock variants, and a sync log
that already contains a `partial` run.

## Not in scope

Real payments, multi-tenancy beyond the `merchantId` column, production auth
(one seeded demo login, bcrypt, signed cookie), and a separate API service. Each
gets a line in the README explaining why, rather than being quietly missing.

## Working agreement

One milestone per session. Propose the approach and wait for review before
writing application code. Commit at the end of every session with a real
message — the history is part of the portfolio.
