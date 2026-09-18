# OrderHub — build brief

The single document to work from. Sections 1–7 are the spec (keep this file in the
repo so Claude Code can read it); sections 8–10 are how to run the build and where
to deploy it.

A public portfolio demo — your own code, fake data, no client code or client data.

**Pitch (one line for the README and the résumé):**
A miniature omnichannel order hub — product/stock/order core, two mock marketplace
connectors, and an admin dashboard — built to demonstrate the integration patterns
behind real multi-channel commerce.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App + API | Next.js (App Router) + TypeScript + Tailwind, API routes under `app/api` | one repo, one deploy, entirely free |
| Business logic | `src/server/` — services, channel adapters, state machine | keeps the layering visible; would lift into NestJS unchanged |
| DB | PostgreSQL via Prisma | Neon free tier |
| Cache / queue | Redis (Upstash) | rate limit, cached counters, retry queue |
| Auth | one seeded demo login (email + password) | out of scope to do properly — say so |
| Deploy | Vercel (web) + Railway or Render (API) | free tiers |

Single app, not a monorepo:

```
app/                 routes + API routes (app/api/**/route.ts)
app/api/mock/a|b/    the mock marketplaces, same app
src/server/          services, channel adapters, order state machine
src/lib/             types + zod schemas shared by both sides
prisma/              schema, migrations, seed
```

**Why not a separate NestJS API:** two apps means a second deploy, and no host
has a genuinely free always-on tier for it — Render's free plan sleeps after 15
minutes and takes ~50 seconds to wake, which reads as a broken link to anyone
clicking from your résumé. Keeping the service layer isolated in `src/server/`
preserves the layering, so the honest answer to "why not Nest?" is *"a single
deploy for a demo; the service layer would lift out unchanged."* Put that in the
README and the shortcut becomes a design decision.

---

## 2. Data model

Nine tables. The two that matter for interviews are `StockMovement` and
`SyncJob` — those are where you show judgement.

```
Merchant        id, name, createdAt
Product         id, merchantId, sku (unique per merchant), name, status
Variant         id, productId, sku, attributes(jsonb), price
Warehouse       id, merchantId, name, code
StockMovement   id, variantId, warehouseId, delta(int), reason(enum:
                purchase|sale|adjustment|return|sync), refType, refId, createdAt
                -- append only. current stock = SUM(delta). never UPDATE.
Order           id, merchantId, channelId, externalId, status(enum),
                customerName, total, placedAt
                -- unique(channelId, externalId)  <- this is the idempotency guard
OrderItem       id, orderId, variantId, qty, unitPrice
Channel         id, merchantId, kind(enum: mock_a|mock_b|storefront), name,
                credentials(jsonb), cursor(text), isActive
SyncJob         id, channelId, type(enum: catalog_push|order_pull),
                status(enum: queued|running|succeeded|partial|failed),
                startedAt, finishedAt, attempt, itemsOk, itemsFailed,
                errorSummary(jsonb)
```

**Design decisions to write up in the README** (this is the part interviewers read):
1. Stock as an append-only ledger, not a mutable `qty` column — gives an audit
   trail, makes concurrent updates safe, and lets you explain a discrepancy
   after the fact. Add a materialised `StockLevel` view for fast reads.
2. `unique(channelId, externalId)` on orders — re-pulling the same page never
   creates duplicates. Say plainly that this is the bug that bites every
   integration.
3. `SyncJob` records `partial` as a first-class outcome, because batch APIs
   fail per-item, not per-request.

---

## 3. API surface

```
POST   /auth/login
GET    /products?query=&status=&page=
POST   /products
GET    /products/:id
GET    /stock?warehouseId=            -> derived levels
POST   /stock/movements                -> adjustment, with reason
GET    /orders?status=&channelId=&from=&to=&page=
GET    /orders/:id
POST   /orders/:id/transition          -> { to: "packed" } , 409 on illegal move
GET    /channels
POST   /channels/:id/sync/catalog      -> queues a catalog_push job
POST   /channels/:id/sync/orders       -> queues an order_pull job
GET    /sync-jobs?channelId=&status=
POST   /webhooks/:channelKind          -> verify token + signature, then enqueue
GET    /dashboard/summary              -> cached in Redis, 60s TTL
```

Order state machine — reject anything not on this list with a 409 and a clear body:

```
created  -> paid, cancelled
paid     -> packed, cancelled
packed   -> shipped
shipped  -> (terminal)
cancelled-> (terminal)
```

---

## 4. Mock marketplaces

Write these yourself as routes in the same app (`app/api/mock/a`, `app/api/mock/b`)
— which also means the whole demo runs with one command. They must be *annoying*
in realistic ways; that is the entire point:

- **MockShop A** — batch catalog endpoint accepting up to 50 items, returns
  per-item success/failure; order list is cursor-paginated; sends webhooks with
  an HMAC signature header
- **MockShop B** — different field names and a different date format (force
  yourself to write a mapping layer); rate-limits at 10 req/min with 429 +
  `Retry-After`; occasionally returns a 500 so your retry path gets exercised

Your connector layer then has one interface, two adapters:

```ts
interface ChannelAdapter {
  pushCatalog(items: CatalogItem[]): Promise<BatchResult>;
  pullOrders(cursor?: string): Promise<{ orders: ExternalOrder[]; next?: string }>;
  verifyWebhook(headers, rawBody): boolean;
  parseWebhook(payload): WebhookEvent;
}
```

Redis: token-bucket rate limiter per channel, and a retry queue with exponential
backoff for failed catalog items.

---

## 5. Screens (admin dashboard)

1. **Overview** — today's orders, orders by status, low stock count, last sync
   per channel, recent failures (cached summary endpoint)
2. **Orders** — table with status/channel/date filters, search; row click → detail
3. **Order detail** — items, totals, timeline of status changes, transition buttons
   that grey out illegal moves
4. **Products & stock** — product list, variant stock per warehouse, adjustment
   dialog that writes a movement with a reason
5. **Channels** — connect/disconnect, "Sync catalog" and "Pull orders" buttons
6. **Sync log** — job list with status pill, items ok/failed, expandable error
   detail

Keep the visual design plain and confident: one neutral palette, one accent,
generous white space, real table density. Do not decorate it.

---

## 6. Milestones

| # | Deliverable | Rough effort |
|---|---|---|
| 1 | Project scaffold, Prisma schema, migrations, seed script | 1 evening |
| 2 | Products + stock ledger + derived levels, API + screens | 2–3 evenings |
| 3 | Orders + state machine + detail screen | 2 evenings |
| 4 | MockShop A + adapter + catalog push + sync log | 2–3 evenings |
| 5 | MockShop B + order pull with idempotency + webhooks | 2–3 evenings |
| 6 | Redis rate limit, retry queue, cached dashboard | 1–2 evenings |
| 7 | Deploy, seed demo data, write the README | 1–2 evenings |

Ship milestone 3 publicly and keep going — a live half-built demo beats a perfect
private one.

---

## 7. README outline

```
# OrderHub
One-paragraph what & why.  [Live demo](link) — demo@orderhub.dev / demo1234

## Why I built this
Two sentences: 8 years on real order-management systems; this is the pattern,
rebuilt from scratch as public code.

## What's in it
5 bullets with a screenshot each (Overview, Orders, Sync log, Stock, Channels)

## Architecture
Mermaid diagram: web -> api -> postgres, api -> redis, api <-> mock marketplaces

## Data model
Mermaid ER diagram + the three design decisions from section 2 above

## Integration patterns
Idempotency keys, batch partial failure, webhook verification, retry with backoff,
rate limiting — a short paragraph each

## How I worked
Which parts I specced, which parts Claude Code generated, how I reviewed and
tested them. Be specific and honest — this is the AI-native evidence.

## Not in scope
Real payments, multi-tenancy, production auth, a separate API service. And why.

## Run locally
docker compose up, pnpm install, pnpm db:seed, pnpm dev
```

---

## 8. Kickoff prompt for Claude Code

Paste this, then review before letting it generate application code:

> I'm building a portfolio project called OrderHub: a miniature omnichannel
> order-management demo. Single Next.js App Router app (TypeScript, Tailwind),
> API routes under `app/api`, business logic in `src/server/` (services, channel
> adapters, order state machine). PostgreSQL via Prisma, Redis via Upstash.
>
> Domain: merchants, products with variants, warehouses, stock tracked as an
> append-only movement ledger (current stock = SUM(delta), never an UPDATE),
> orders driven by an explicit state machine (created → paid → packed → shipped,
> plus cancelled), channels, and sync jobs that can end `partial`.
> Orders have unique(channelId, externalId) as an idempotency guard.
>
> Step 1 only: propose the Prisma schema, the folder structure, and the
> ChannelAdapter interface. Explain the trade-offs in the stock ledger and the
> idempotency design. Do not generate application code yet — wait for my review.

Then one milestone per session, each starting with "here is the milestone, propose
the approach first."

---

## 8. How to work with Claude Code

Four rules. They matter more than the prompts.

1. **One milestone per session.** Start a fresh session for each. Long sessions
   drift.
2. **Always ask for the plan before the code.** End every kickoff prompt with
   *"propose the approach first and wait for my review."* Then actually read it.
3. **Make it write tests for the three hard parts** — stock ledger maths, order
   state machine, idempotent order pull. Everything else can go untested; those
   three are what you will be asked about.
4. **Commit after every session** with a real message. Your commit history is
   part of the portfolio.

Keep a `CLAUDE.md` at the repo root so you stop re-explaining the project. Ask
Claude Code to write it in session 1 — roughly: the stack, the folder layout,
"stock is append-only, never UPDATE a quantity", "orders are unique per
(channelId, externalId)", "illegal state transitions return 409", and the coding
conventions you want.

---

---

## 9. Session-by-session prompts

### Session 1 — scaffold and schema

> I'm building a portfolio demo called OrderHub: a miniature omnichannel
> order-management app. Single Next.js App Router app, TypeScript, Tailwind,
> API routes under app/api, business logic in src/server (services, channel
> adapters, order state machine). PostgreSQL via Prisma. Redis via Upstash.
>
> Domain: merchants, products with variants, warehouses, stock tracked as an
> append-only movement ledger (current stock = SUM(delta) — never UPDATE a
> quantity), orders driven by an explicit state machine (created → paid → packed
> → shipped, plus cancelled from created or paid), channels, and sync jobs whose
> status can be queued/running/succeeded/partial/failed. Orders carry
> unique(channelId, externalId) as an idempotency guard.
>
> Propose the Prisma schema, the folder structure, and a CLAUDE.md for the repo.
> Explain the trade-offs in the stock ledger and the idempotency design.
> Do not generate application code yet — wait for my review.

Then: *"Good. Now scaffold the project, apply the migration, and write a seed
script with 3 warehouses, 50 fictional products with variants, and 200 orders
spread across the last 60 days and across statuses."*

### Session 2 — products and stock

> Milestone 2 of OrderHub. Build the product and stock layer: product list with
> search and status filter, product detail with variants, stock levels per
> warehouse derived from the movement ledger, and a stock adjustment dialog that
> writes a movement with a reason. Include unit tests for the level derivation,
> including negative adjustments and multiple warehouses.
> Propose the approach first — API route shapes, service functions, screens —
> and wait for my review.

### Session 3 — orders and the state machine

> Milestone 3 of OrderHub. Orders list with status/channel/date filters and
> search, order detail with items, totals and a timeline of status changes, and
> transition actions. The state machine lives in src/server and is the only place
> transitions are decided: created → paid|cancelled, paid → packed|cancelled,
> packed → shipped, shipped and cancelled terminal. Illegal transitions return
> 409 with a readable body, and the UI disables those buttons from the same
> source of truth. Unit-test every legal and illegal transition.
> Propose the approach first.

Deploy at the end of this session. Do not wait for the rest.

### Session 4 — MockShop A and the adapter interface

> Milestone 4 of OrderHub. Add a ChannelAdapter interface
> (pushCatalog, pullOrders, verifyWebhook, parseWebhook) and the first adapter.
> Also build MockShop A itself under app/api/mock/a: a batch catalog endpoint
> accepting up to 50 items and returning per-item success/failure, a
> cursor-paginated order list, and a webhook sender with an HMAC signature header.
> Catalog push must record a SyncJob, and a run where some items fail must end as
> 'partial' with the failed items recorded — not as a blanket failure.
> Add a sync log screen showing jobs with status, items ok/failed and expandable
> errors. Propose the approach first.

### Session 5 — MockShop B and idempotent order pull

> Milestone 5 of OrderHub. Add MockShop B under app/api/mock/b, deliberately
> different from A: different field names, a different date format, a 10 req/min
> rate limit returning 429 with Retry-After, and a 500 on roughly 1 in 20 calls.
> Write the second adapter with its own mapping layer, and implement order pull
> that is idempotent — re-pulling the same cursor page must not create duplicate
> orders. Also add the webhook receiver route with verify-token and signature
> validation. Unit-test the mapping and the idempotency.
> Propose the approach first.

### Session 6 — Redis

> Milestone 6 of OrderHub. Add Redis (Upstash): a token-bucket rate limiter per
> channel so we respect MockShop B's limit instead of getting 429s, a retry queue
> with exponential backoff for failed catalog items, and a 60-second cache on the
> dashboard summary endpoint. Make the cache invalidate on order status change.
> Propose the approach first.

### Session 7 — polish and README

> Final milestone of OrderHub. Build the overview dashboard: today's orders,
> orders by status, low-stock count, last sync per channel, recent failures —
> reading the cached summary endpoint. Then write the README following the
> outline in OrderHub Spec.md section 7, including Mermaid diagrams for the
> architecture and the ER model, and the three design-decision write-ups.
> Leave the "How I worked" section as a stub for me to write myself.

Write that last section yourself, in your own words. It is the one part an
interviewer can tell was not generated.

---

## 10. Free hosting

Everything below has a real free tier, no card required for the first three.

| What | Where | Notes |
|---|---|---|
| The app | **Vercel** | Made for Next.js. Connect the GitHub repo, it deploys on push. Free for personal projects, custom domain included. |
| PostgreSQL | **Neon** | Free tier ~0.5 GB, serverless, works well with Prisma. Scales to zero, so the first request after idle is slow — fine for a demo. |
| Redis | **Upstash** | Free tier ~10k commands/day, HTTP-based so it works from Vercel's serverless runtime. Plenty for this. |
| Alternative DB | **Supabase** | Also free Postgres, plus a dashboard you can browse. Pick Neon or Supabase, not both. |

**Order of operations:** create the Neon database first and copy its connection
string, create the Upstash database and copy its two env values, then import the
repo into Vercel and paste all of them into Environment Variables before the
first deploy. Run `prisma migrate deploy` and the seed script against the Neon
database from your laptop.

**If you keep the separate NestJS API** you need a fourth service for it —
Railway (free trial credit, then paid) or Render (free tier, but it sleeps after
15 minutes and takes ~50 seconds to wake, which looks broken to a recruiter
clicking your link). This is the main reason to go single-app.

**Two things that make the demo look professional:**
- Seed the database so the dashboard is never empty. An empty demo reads as broken.
- Put the demo credentials in the README and on the login screen itself.

---

---

## 11. Order of work

1. **This weekend** — publish the case studies and tidy the GitHub profile
   (see `Portfolio Content.md`). No code, and the links go on the résumé now.
2. **Sessions 1–3** — get OrderHub deployed with products, stock and orders live.
3. **Sessions 4–6** — the integration work, the part that is actually about you.
4. **Session 7** — README and screenshots, then add the demo link to both résumés.

Write the README's "How I worked" section yourself, in your own words. It is the
one part an interviewer can tell was not generated.
