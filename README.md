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
and pre-aggregated rows. The services, routes and UI around it are deliberately
untested; the three suites that matter are listed in
[CLAUDE.md](CLAUDE.md#testing) and arrive with the milestones they belong to.

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

Demo login: `demo@orderhub.dev` / `demo1234`
