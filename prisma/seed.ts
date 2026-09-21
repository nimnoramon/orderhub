import 'dotenv/config';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/server/db';
import { databaseTarget, demoLogin } from '../src/server/demo';
import type { OrderStatus, ProductStatus, StockReason, SyncJobStatus, SyncJobType } from '../src/generated/prisma/enums';

// Fixed seed: the demo data is identical on every machine and every reset, so a
// screenshot in the README still matches the live site.
faker.seed(20260918);

const DAYS_OF_HISTORY = 60;
const PRODUCT_COUNT = 50;
const ORDER_COUNT = 200;
const NOW = new Date('2026-09-18T12:00:00Z');

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const hoursAfter = (at: Date, h: number) => new Date(at.getTime() + h * 3_600_000);
/** Nothing in a demo should be dated in the future. */
const notAfterNow = (at: Date) => (at > NOW ? NOW : at);
const int = (min: number, max: number) => faker.number.int({ min, max });
const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];

/** Pick a key from a weight map, so the data mix stays readable in one place. */
function weighted<K extends string>(weights: Record<K, number>): K {
  const total = Object.values<number>(weights).reduce((a, b) => a + b, 0);
  let roll = faker.number.float({ min: 0, max: total });
  for (const [key, weight] of Object.entries<number>(weights)) {
    roll -= weight;
    if (roll <= 0) return key as K;
  }
  return Object.keys(weights)[0] as K;
}

const CATEGORIES = [
  { code: 'AUD', name: 'Audio', attr: 'colour', values: ['Black', 'Sand', 'Slate'] },
  { code: 'BAG', name: 'Bags', attr: 'size', values: ['18L', '24L', '32L'] },
  { code: 'DSK', name: 'Desk', attr: 'finish', values: ['Oak', 'Walnut', 'Ash'] },
  { code: 'KIT', name: 'Kitchen', attr: 'size', values: ['S', 'M', 'L'] },
  { code: 'LGT', name: 'Lighting', attr: 'temperature', values: ['2700K', '4000K'] },
  { code: 'PWR', name: 'Power', attr: 'capacity', values: ['5000mAh', '10000mAh', '20000mAh'] },
] as const;

/** created -> ... -> status. The seed only writes paths the state machine allows. */
const STATUS_PATH: Record<OrderStatus, OrderStatus[]> = {
  created: ['created'],
  paid: ['created', 'paid'],
  packed: ['created', 'paid', 'packed'],
  shipped: ['created', 'paid', 'packed', 'shipped'],
  cancelled: ['created', 'cancelled'],
};

type MovementRow = {
  variantId: string;
  warehouseId: string;
  delta: number;
  reason: StockReason;
  refType: string;
  refId: string | null;
  note?: string;
  createdAt: Date;
};

async function reset() {
  // Child rows first: the schema only cascades from Order and Product.
  await prisma.orderEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.syncJob.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchant.deleteMany();
}

async function main() {
  // This script deletes everything before it writes anything, and `db:seed:prod`
  // points it at the production branch. Saying which database is about to be
  // rewritten costs one line and is the difference between a reseeded demo and
  // a very bad evening.
  console.log(`seeding      ${databaseTarget()}\n`);

  await reset();

  const merchant = await prisma.merchant.create({ data: { name: 'Northwind Supply Co.' } });

  const login = demoLogin();
  await prisma.user.create({
    data: {
      merchantId: merchant.id,
      email: login.email,
      passwordHash: await bcrypt.hash(login.password, 10),
      name: 'Demo User',
    },
  });

  await prisma.warehouse.createMany({
    data: [
      { merchantId: merchant.id, name: 'Rotterdam DC', code: 'RTM' },
      { merchantId: merchant.id, name: 'Singapore Hub', code: 'SIN' },
      { merchantId: merchant.id, name: 'Chicago Overflow', code: 'ORD' },
    ],
  });
  const warehouses = await prisma.warehouse.findMany({ orderBy: { code: 'asc' } });

  await prisma.channel.createMany({
    data: [
      {
        merchantId: merchant.id,
        kind: 'mock_a',
        name: 'MockShop A',
        credentials: {
          apiKey: 'mock-a-key',
          webhookSecret: process.env.MOCK_A_WEBHOOK_SECRET ?? 'mock-a-secret',
        },
        cursor: 'cur_a_00042',
        lastSyncedAt: hoursAfter(NOW, -3),
      },
      {
        merchantId: merchant.id,
        kind: 'mock_b',
        name: 'MockShop B',
        credentials: {
          clientId: process.env.MOCK_B_CLIENT_ID ?? 'mock-b-client',
          clientSecret: process.env.MOCK_B_CLIENT_SECRET ?? 'mock-b-secret-key',
          webhookSecret: process.env.MOCK_B_WEBHOOK_SECRET ?? 'mock-b-secret',
        },
        // A timestamp, because B paginates by watermark where A hands out an
        // opaque id — the Channels screen shows both, and they are meant to look
        // as different as they are. Placed 84 orders from the end of B's feed so
        // the demo has something to pull: one click reads the three pages a run
        // is allowed, and a second finishes the feed and reports it caught up.
        cursor: '2026-09-08T00:00:00.000Z',
        lastSyncedAt: hoursAfter(NOW, -11),
      },
      { merchantId: merchant.id, kind: 'storefront', name: 'OrderHub Storefront', credentials: {} },
    ],
  });
  const channels = await prisma.channel.findMany();
  const channelByKind = Object.fromEntries(channels.map((c) => [c.kind, c]));

  // --- products and variants -------------------------------------------------
  const productRows = Array.from({ length: PRODUCT_COUNT }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length];
    return {
      merchantId: merchant.id,
      sku: `${category.code}-${1001 + i}`,
      name: `${faker.commerce.productAdjective()} ${category.name} ${faker.commerce.product()}`,
      status: weighted({ active: 84, draft: 10, archived: 6 }) as ProductStatus,
      createdAt: daysAgo(int(DAYS_OF_HISTORY, DAYS_OF_HISTORY + 120)),
    };
  });
  await prisma.product.createMany({ data: productRows });
  const products = await prisma.product.findMany({ orderBy: { sku: 'asc' } });

  const variantRows = products.flatMap((product) => {
    const category = CATEGORIES.find((c) => product.sku.startsWith(c.code))!;
    const values = faker.helpers.arrayElements(category.values, int(1, category.values.length));
    return values.map((value) => ({
      productId: product.id,
      sku: `${product.sku}-${value.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
      attributes: { [category.attr]: value },
      priceCents: int(9, 249) * 100 + 99,
    }));
  });
  await prisma.variant.createMany({ data: variantRows });
  const variants = await prisma.variant.findMany({ orderBy: { sku: 'asc' } });

  // --- opening stock ----------------------------------------------------------
  // One purchase movement per variant per warehouse. Roughly one in ten lands
  // near zero so the dashboard's low-stock tile has something real to show.
  const movements: MovementRow[] = [];
  for (const variant of variants) {
    for (const warehouse of warehouses) {
      const low = faker.datatype.boolean({ probability: 0.1 });
      movements.push({
        variantId: variant.id,
        warehouseId: warehouse.id,
        delta: low ? int(2, 9) : int(60, 240),
        reason: 'purchase',
        refType: 'seed',
        refId: null,
        note: 'Opening balance',
        createdAt: daysAgo(DAYS_OF_HISTORY + 2),
      });
    }
  }

  // --- orders -----------------------------------------------------------------
  const sellable = variants.filter((_, i) => i % 7 !== 0); // a few variants never sell
  const orderRows = Array.from({ length: ORDER_COUNT }, (_, i) => {
    const kind = weighted({ mock_a: 40, mock_b: 35, storefront: 25 });
    const ageDays = int(0, DAYS_OF_HISTORY);

    // Storefront orders carry no externalId, so (channelId, externalId) is not a
    // unique key for them. The distinct millisecond keeps every placedAt unique,
    // which is what this script matches rows on after the bulk insert — and real
    // timestamps have milliseconds anyway.
    const placedAt = new Date(daysAgo(ageDays));
    placedAt.setUTCHours(int(6, 21), int(0, 59), int(0, 59), i);
    const placed = notAfterNow(placedAt);

    // How far an order has got depends on how long ago it was placed. An order
    // from two hours ago being already `shipped` is the kind of detail that makes
    // seeded data look seeded.
    const status = (
      ageDays < 1
        ? weighted({ created: 55, paid: 35, cancelled: 10 })
        : ageDays < 4
          ? weighted({ paid: 34, packed: 30, shipped: 22, created: 6, cancelled: 8 })
          : weighted({ shipped: 72, packed: 7, paid: 7, created: 3, cancelled: 11 })
    ) as OrderStatus;

    return {
      merchantId: merchant.id,
      channelId: channelByKind[kind].id,
      externalId:
        kind === 'storefront' ? null : kind === 'mock_a' ? `A-${100_000 + i}` : `ORD-B-${770_000 + i}`,
      status,
      customerName: faker.person.fullName(),
      totalCents: 0, // filled in below, once the lines are picked
      placedAt: placed,
      createdAt: placed,
    };
  });

  // Lines are chosen before the insert so each order total matches its lines on
  // the first write — a total that disagrees with its lines is the first thing a
  // reviewer notices in a demo.
  const linesByIndex = orderRows.map(() =>
    faker.helpers.arrayElements(sellable, int(1, 4)).map((variant) => ({
      variantId: variant.id,
      qty: int(1, 3),
      unitPriceCents: variant.priceCents,
    })),
  );
  orderRows.forEach((order, i) => {
    order.totalCents = linesByIndex[i].reduce((sum, line) => sum + line.qty * line.unitPriceCents, 0);
  });

  await prisma.order.createMany({ data: orderRows });
  const orders = await prisma.order.findMany();
  const keyOf = (channelId: string, externalId: string | null, placedAt: Date) =>
    `${channelId}|${externalId ?? ''}|${placedAt.toISOString()}`;
  const orderByKey = new Map(orders.map((o) => [keyOf(o.channelId, o.externalId, o.placedAt), o]));
  // If two orders ever shared a key, one would silently collect the other's lines
  // and both totals would be wrong. Fail here instead.
  if (orderByKey.size !== orders.length) {
    throw new Error(`seeded orders are not uniquely keyed: ${orders.length} rows, ${orderByKey.size} keys`);
  }

  const orderItems: { orderId: string; variantId: string; qty: number; unitPriceCents: number }[] = [];
  const orderEvents: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actor: string;
    createdAt: Date;
  }[] = [];

  orderRows.forEach((row, i) => {
    const order = orderByKey.get(keyOf(row.channelId, row.externalId, row.placedAt));
    if (!order) throw new Error(`seeded order ${i} was not found after insert`);

    for (const line of linesByIndex[i]) orderItems.push({ orderId: order.id, ...line });

    const kind = channels.find((c) => c.id === row.channelId)!.kind;
    const actor = row.externalId ? `channel:${kind}` : 'seed';
    const path = STATUS_PATH[row.status];
    let at = row.placedAt;
    path.forEach((toStatus, step) => {
      at = step === 0 ? row.placedAt : notAfterNow(hoursAfter(at, int(2, 30)));
      orderEvents.push({
        orderId: order.id,
        fromStatus: step === 0 ? null : path[step - 1],
        toStatus,
        actor,
        createdAt: at,
      });
    });

    // Stock leaves the warehouse when the order is paid, not when it is placed,
    // so `created` and `cancelled` orders hold no stock.
    if (row.status === 'created' || row.status === 'cancelled') return;
    const fulfilling = pick(warehouses);
    const paidAt = notAfterNow(hoursAfter(row.placedAt, int(1, 20)));
    for (const line of linesByIndex[i]) {
      movements.push({
        variantId: line.variantId,
        warehouseId: fulfilling.id,
        delta: -line.qty,
        reason: 'sale',
        refType: 'order',
        refId: order.id,
        createdAt: paidAt,
      });
      // A handful of shipped orders come back.
      if (row.status === 'shipped' && faker.datatype.boolean({ probability: 0.04 })) {
        movements.push({
          variantId: line.variantId,
          warehouseId: fulfilling.id,
          delta: line.qty,
          reason: 'return',
          refType: 'order',
          refId: order.id,
          note: 'Customer return',
          createdAt: notAfterNow(hoursAfter(paidAt, int(72, 340))),
        });
      }
    }
  });

  // Cycle-count corrections, so the ledger also shows levels moving without an
  // order behind them — which is the reason the ledger exists.
  for (let i = 0; i < 20; i++) {
    movements.push({
      variantId: pick(variants).id,
      warehouseId: pick(warehouses).id,
      delta: pick([-4, -3, -2, -1, 1, 2, 5]),
      reason: 'adjustment',
      refType: 'manual',
      refId: null,
      note: pick(['Cycle count', 'Damaged in transit', 'Found in returns bin', 'Miscount corrected']),
      createdAt: daysAgo(int(1, DAYS_OF_HISTORY)),
    });
  }

  // The ledger permits a negative level and the service layer decides whether to
  // allow one — but seeded demo data should not open on an impossible number, so
  // any pair that ended up short gets a bigger opening purchase instead.
  const shortfall = new Map<string, number>();
  for (const m of movements) {
    const key = `${m.variantId}|${m.warehouseId}`;
    shortfall.set(key, (shortfall.get(key) ?? 0) + m.delta);
  }
  for (const m of movements) {
    if (m.reason !== 'purchase') continue;
    const key = `${m.variantId}|${m.warehouseId}`;
    const net = shortfall.get(key)!;
    if (net >= 0) continue;
    m.delta += -net + 10; // clear the deficit and leave a little on the shelf
    shortfall.set(key, 10);
  }

  await prisma.orderItem.createMany({ data: orderItems });
  await prisma.orderEvent.createMany({ data: orderEvents });
  await prisma.stockMovement.createMany({ data: movements });

  // --- sync history -------------------------------------------------------------
  // Includes `partial` runs, because that outcome is the point of the project and
  // an empty sync log would hide it.
  //
  // Code and message travel as a pair. Picking them independently produced rows
  // like SKU_REJECTED / "price must be greater than zero", which nobody notices
  // until the sync log puts the two side by side.
  const SYNC_FAILURES = [
    { code: 'INVALID_PRICE', message: 'price must be greater than zero' },
    { code: 'MISSING_ATTRIBUTE', message: 'attribute "size" is required by this channel' },
    { code: 'SKU_REJECTED', message: 'sku is already mapped to another listing' },
    { code: 'RATE_LIMITED', message: 'rate limit exceeded, retry after 6s' },
  ] as const;

  const syncJobs = Array.from({ length: 14 }, () => {
    const channel = pick([channelByKind.mock_a, channelByKind.mock_b]);
    const type = pick(['catalog_push', 'order_pull'] as const) as SyncJobType;
    const startedAt = hoursAfter(daysAgo(int(0, 14)), int(0, 23));
    const status = weighted({ succeeded: 62, partial: 20, failed: 12, queued: 6 }) as SyncJobStatus;
    const itemsFailed = status === 'partial' ? int(1, 6) : status === 'failed' ? int(0, 3) : 0;
    const itemsOk = status === 'failed' || status === 'queued' ? 0 : int(18, 50);

    return {
      channelId: channel.id,
      type,
      status,
      startedAt: status === 'queued' ? null : startedAt,
      finishedAt: status === 'queued' ? null : hoursAfter(startedAt, int(1, 4) / 60),
      attempt: status === 'failed' ? int(2, 3) : 1,
      itemsOk,
      itemsFailed,
      errorSummary:
        itemsFailed > 0
          ? Array.from({ length: itemsFailed }, () => ({
              ref: pick(variants).sku,
              ...pick(SYNC_FAILURES),
            }))
          : undefined,
      createdAt: startedAt,
    };
  });
  await prisma.syncJob.createMany({ data: syncJobs });

  const unitsOnHand = movements.reduce((sum, m) => sum + m.delta, 0);
  console.log(
    [
      `merchant     ${merchant.name}`,
      `login        ${login.email} / ${login.password}`,
      `warehouses   ${warehouses.length}`,
      `channels     ${channels.length}`,
      `products     ${products.length} (${variants.length} variants)`,
      `orders       ${orders.length} (${orderItems.length} lines, ${orderEvents.length} events)`,
      `movements    ${movements.length} (${unitsOnHand} units on hand)`,
      `sync jobs    ${syncJobs.length}`,
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
