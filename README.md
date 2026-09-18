# OrderHub

A miniature omnichannel order hub: a product/stock/order core, two mock marketplace
connectors, and an admin dashboard — built to demonstrate the integration patterns
behind real multi-channel commerce.

Work in progress. The full README, with architecture and ER diagrams and the
design-decision write-ups, is written at milestone 7; the spec it is being built
from is in [OrderHub Build Brief.md](OrderHub%20Build%20Brief.md), and the working
rules are in [CLAUDE.md](CLAUDE.md).

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
