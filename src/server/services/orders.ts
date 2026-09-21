import type { Prisma } from '@/generated/prisma/client';
import { OrderStatus } from '@/generated/prisma/enums';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/http/errors';
import { assertTransition, nextStatuses } from '@/server/orders/state-machine';
import { listChannels } from '@/server/services/channels';
import { invalidateDashboard } from '@/server/services/dashboard';
import { listWarehouses, toDeltaRows } from '@/server/services/stock';
import { deriveLevels } from '@/server/stock/levels';
import { endOfUtcDayExclusive, startOfUtcDay } from '@/lib/dates';
import type { OrderListQuery, OrderTransitionInput } from '@/lib/schemas/orders';
import type { OrderDetail, OrderEventItem, OrderLine, OrderListItem, OrdersPage } from '@/lib/types';

/**
 * Cuids are unreadable in a table and storefront orders have no channel id, so
 * a short form of our own stands in. It is display only — nothing looks an
 * order up by it.
 */
const referenceOf = (externalId: string | null, id: string): string =>
  externalId ?? `#${id.slice(-6).toUpperCase()}`;

const mapEvent = (row: {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: string;
  note: string | null;
  createdAt: Date;
}): OrderEventItem => ({
  id: row.id,
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  actor: row.actor,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

export async function listOrders(merchantId: string, input: OrderListQuery): Promise<OrdersPage> {
  const placedAt = {
    ...(input.from ? { gte: startOfUtcDay(input.from) } : {}),
    ...(input.to ? { lt: endOfUtcDayExclusive(input.to) } : {}),
  };

  const where: Prisma.OrderWhereInput = {
    merchantId,
    ...(input.status ? { status: input.status } : {}),
    // An unknown channelId returns nothing rather than 404: this is a filter,
    // not the resource being addressed, and `merchantId` above already stops it
    // reading another merchant's orders.
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(Object.keys(placedAt).length > 0 ? { placedAt } : {}),
    ...(input.query
      ? {
          OR: [
            { customerName: { contains: input.query, mode: 'insensitive' as const } },
            { externalId: { contains: input.query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, orders, channels] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      // placedAt is not unique, so a second key keeps paging stable — without it
      // an order can sit on two pages, or on none.
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        externalId: true,
        status: true,
        customerName: true,
        totalCents: true,
        currency: true,
        placedAt: true,
        channel: { select: { id: true, name: true, kind: true } },
      },
    }),
    listChannels(merchantId),
  ]);

  // Units, not lines — "3 items" should mean three things in the box. Postgres
  // sums them for the page's orders in one query, rather than every line of
  // every order being loaded to be counted here.
  const unitsByOrder = new Map<string, number>();
  if (orders.length > 0) {
    const grouped = await prisma.orderItem.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orders.map((order) => order.id) } },
      _sum: { qty: true },
    });
    for (const row of grouped) unitsByOrder.set(row.orderId, row._sum.qty ?? 0);
  }

  const data: OrderListItem[] = orders.map((order) => ({
    id: order.id,
    reference: referenceOf(order.externalId, order.id),
    externalId: order.externalId,
    channel: order.channel,
    status: order.status,
    customerName: order.customerName,
    itemCount: unitsByOrder.get(order.id) ?? 0,
    totalCents: order.totalCents,
    currency: order.currency,
    placedAt: order.placedAt.toISOString(),
  }));

  return {
    data,
    channels,
    page: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getOrder(merchantId: string, id: string): Promise<OrderDetail> {
  const order = await prisma.order.findFirst({
    where: { id, merchantId },
    select: {
      id: true,
      externalId: true,
      status: true,
      customerName: true,
      totalCents: true,
      currency: true,
      placedAt: true,
      updatedAt: true,
      channel: { select: { id: true, name: true, kind: true } },
      items: {
        select: {
          id: true,
          qty: true,
          unitPriceCents: true,
          variant: {
            select: {
              id: true,
              sku: true,
              attributes: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      },
      events: {
        // Two events can share a timestamp — the seed writes whole paths at
        // once — so the id breaks the tie and the timeline never reorders.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          actor: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });
  if (!order) throw notFound('Order');

  const items: OrderLine[] = order.items.map((item) => ({
    id: item.id,
    variantId: item.variant.id,
    variantSku: item.variant.sku,
    attributes: (item.variant.attributes ?? {}) as Record<string, string>,
    productId: item.variant.product.id,
    productName: item.variant.product.name,
    qty: item.qty,
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.qty * item.unitPriceCents,
  }));

  return {
    id: order.id,
    reference: referenceOf(order.externalId, order.id),
    externalId: order.externalId,
    channel: order.channel,
    status: order.status,
    customerName: order.customerName,
    totalCents: order.totalCents,
    // The order's total is what the channel charged; the lines are what we know
    // about. They agree for every order this app writes, and a channel that
    // applied a discount or free shipping would make them disagree — so both
    // travel, and the screen says which is which instead of quietly showing one.
    lineTotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    currency: order.currency,
    placedAt: order.placedAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items,
    timeline: order.events.map(mapEvent),
    allowedTransitions: [...nextStatuses(order.status)],
  };
}

/** What an order takes out of stock, one entry per variant. */
const unitsByVariant = (items: { variantId: string; qty: number }[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.variantId, (totals.get(item.variantId) ?? 0) + item.qty);
  return totals;
};

/**
 * Take the order's stock out of the warehouses. Stock leaves when an order is
 * paid, not when it is placed — the same rule the seed follows, so a demo that
 * has been clicked through still adds up.
 *
 * The warehouse is picked per variant: the one holding the most of it, ties
 * broken by warehouse code since `listWarehouses` returns them in that order.
 * There is no allocation or reservation model here, and a fake one would be the
 * interesting half of a feature this demo does not have.
 *
 * A sale is never refused for want of stock. The `wouldGoNegative` guard belongs
 * to manual adjustments, where a negative result means someone mistyped a count.
 * Here the sale has already happened, and declining to record it would not bring
 * the goods back — it would only make the ledger disagree with the warehouse.
 */
async function writeSaleMovements(
  tx: Prisma.TransactionClient,
  merchantId: string,
  orderId: string,
  items: { variantId: string; qty: number }[],
) {
  const units = unitsByVariant(items);
  if (units.size === 0) return;

  const variantIds = [...units.keys()];
  const warehouses = await listWarehouses(merchantId, tx);
  const grouped = await tx.stockMovement.groupBy({
    by: ['variantId', 'warehouseId'],
    where: { variantId: { in: variantIds }, warehouse: { merchantId } },
    _sum: { delta: true },
  });
  const levels = deriveLevels(
    toDeltaRows(grouped),
    variantIds,
    warehouses.map((warehouse) => warehouse.id),
  );

  await tx.stockMovement.createMany({
    data: levels.map((level) => {
      const fullest = level.byWarehouse.reduce((best, cell) =>
        cell.onHand > best.onHand ? cell : best,
      );
      return {
        variantId: level.variantId,
        warehouseId: fullest.warehouseId,
        delta: -units.get(level.variantId)!,
        reason: 'sale' as const,
        refType: 'order',
        refId: orderId,
      };
    }),
  });
}

/**
 * Put back what the order took. Rather than choosing a warehouse a second time,
 * the order's own sale movements are read and inverted, so the stock returns to
 * the shelf it left from. The reason is `adjustment`, not `return`: nothing was
 * shipped and nothing came back, the sale simply stopped being true.
 */
async function reverseSaleMovements(tx: Prisma.TransactionClient, orderId: string) {
  const sales = await tx.stockMovement.findMany({
    where: { refType: 'order', refId: orderId, reason: 'sale' },
    select: { variantId: true, warehouseId: true, delta: true },
  });
  if (sales.length === 0) return;

  await tx.stockMovement.createMany({
    data: sales.map((sale) => ({
      variantId: sale.variantId,
      warehouseId: sale.warehouseId,
      delta: -sale.delta,
      reason: 'adjustment' as const,
      refType: 'order',
      refId: orderId,
      note: 'Cancelled after payment',
    })),
  });
}

/**
 * Move an order, or refuse to. The state machine decides; this function makes
 * the decision durable, together with the event that records it and the stock
 * movements the move implies — one transaction, so a status that changed always
 * has its event and its ledger rows beside it.
 */
export async function transitionOrder(
  merchantId: string,
  id: string,
  input: OrderTransitionInput,
  actor: string,
): Promise<OrderDetail> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id, merchantId },
      select: { id: true, status: true, items: { select: { variantId: true, qty: true } } },
    });
    if (!order) throw notFound('Order');

    const from = order.status;
    assertTransition(from, input.to);

    // Compare-and-set: the row moves only if it is still where it was read.
    // Two clicks on "Mark paid" race here, the second matches no rows, and its
    // caller is told what happened instead of writing a second event and a
    // second set of stock movements.
    const moved = await tx.order.updateMany({
      where: { id, merchantId, status: from },
      data: { status: input.to },
    });
    if (moved.count === 0) {
      const current = await tx.order.findFirst({
        where: { id, merchantId },
        select: { status: true },
      });
      throw new AppError(
        'CONFLICT',
        `This order moved to ${current?.status ?? 'another status'} while you were looking at it.`,
        { from, to: input.to, actual: current?.status ?? null },
      );
    }

    await tx.orderEvent.create({
      data: { orderId: id, fromStatus: from, toStatus: input.to, actor, note: input.note },
    });

    if (input.to === OrderStatus.paid) await writeSaleMovements(tx, merchantId, id, order.items);
    if (input.to === OrderStatus.cancelled && from === OrderStatus.paid) {
      await reverseSaleMovements(tx, id);
    }
  });

  // After the commit, never inside it. A transaction that rolled back would
  // otherwise have dropped a cache entry describing a change that did not
  // happen — harmless here, but the habit is the point: the cache follows the
  // database, and it cannot follow something that has not been written yet.
  await invalidateDashboard(merchantId);

  return getOrder(merchantId, id);
}
