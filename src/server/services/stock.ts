import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/server/db';
import { AppError, notFound } from '@/server/http/errors';
import { deriveLevels, isLowStock, wouldGoNegative, type DeltaRow } from '@/server/stock/levels';
import type { CreateMovementInput, StockLevelsQuery } from '@/lib/schemas/stock';
import type {
  AdjustmentResult,
  MovementListItem,
  StockLevelsPage,
  StockLevelRow,
  WarehouseRef,
} from '@/lib/types';

/** The shape every movement query selects so mapMovement can stay one function. */
const movementSelect = {
  id: true,
  variantId: true,
  warehouseId: true,
  delta: true,
  reason: true,
  refType: true,
  note: true,
  createdAt: true,
  variant: { select: { sku: true } },
  warehouse: { select: { code: true } },
} as const;

type MovementRow = {
  id: string;
  variantId: string;
  warehouseId: string;
  delta: number;
  reason: MovementListItem['reason'];
  refType: string | null;
  note: string | null;
  createdAt: Date;
  variant: { sku: string };
  warehouse: { code: string };
};

export const mapMovement = (row: MovementRow): MovementListItem => ({
  id: row.id,
  variantId: row.variantId,
  variantSku: row.variant.sku,
  warehouseId: row.warehouseId,
  warehouseCode: row.warehouse.code,
  delta: row.delta,
  reason: row.reason,
  refType: row.refType,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

/** Prisma's GROUP BY result, in the shape the pure derivation reads. */
export const toDeltaRows = (
  grouped: { variantId: string; warehouseId: string; _sum: { delta: number | null } }[],
): DeltaRow[] =>
  grouped.map((row) => ({
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    delta: row._sum.delta ?? 0,
  }));

/**
 * `client` lets a caller inside a transaction read through it rather than around
 * it. Reads that skip the open transaction see a different snapshot, which is
 * how a service ends up deciding on stale data it has already changed itself.
 */
export async function listWarehouses(
  merchantId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<WarehouseRef[]> {
  return client.warehouse.findMany({
    where: { merchantId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });
}

/**
 * Levels for a page of variants. Postgres does the summing (one row per pair)
 * and the pure derivation turns those rows into the grid, filling in the pairs
 * Postgres had nothing to return for.
 */
export async function summariseLevels(merchantId: string, variantIds: string[], warehouses: WarehouseRef[]) {
  if (variantIds.length === 0) return new Map<string, ReturnType<typeof deriveLevels>[number]>();

  const grouped = await prisma.stockMovement.groupBy({
    by: ['variantId', 'warehouseId'],
    where: { variantId: { in: variantIds }, warehouse: { merchantId } },
    _sum: { delta: true },
  });

  const levels = deriveLevels(
    toDeltaRows(grouped),
    variantIds,
    warehouses.map((w) => w.id),
  );
  return new Map(levels.map((level) => [level.variantId, level]));
}

export async function getStockLevels(
  merchantId: string,
  input: StockLevelsQuery,
): Promise<StockLevelsPage> {
  const warehouses = await listWarehouses(merchantId);
  const scoped = input.warehouseId
    ? warehouses.filter((w) => w.id === input.warehouseId)
    : warehouses;
  if (input.warehouseId && scoped.length === 0) throw notFound('Warehouse');

  const where = {
    product: {
      merchantId,
      ...(input.query
        ? {
            OR: [
              { sku: { contains: input.query, mode: 'insensitive' as const } },
              { name: { contains: input.query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
  };

  const [total, variants] = await Promise.all([
    prisma.variant.count({ where }),
    prisma.variant.findMany({
      where,
      orderBy: { sku: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        sku: true,
        attributes: true,
        product: { select: { id: true, sku: true, name: true } },
      },
    }),
  ]);

  const levelByVariant = await summariseLevels(
    merchantId,
    variants.map((v) => v.id),
    scoped,
  );

  const data: StockLevelRow[] = variants.map((variant) => ({
    variantId: variant.id,
    variantSku: variant.sku,
    attributes: (variant.attributes ?? {}) as Record<string, string>,
    productId: variant.product.id,
    productSku: variant.product.sku,
    productName: variant.product.name,
    levels: levelByVariant.get(variant.id)!,
  }));

  return {
    data,
    warehouses: scoped,
    page: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

/** The ledger itself, newest first — the audit trail the design exists for. */
export async function listMovements(
  merchantId: string,
  options: { variantIds?: string[]; limit?: number } = {},
): Promise<MovementListItem[]> {
  const rows = await prisma.stockMovement.findMany({
    where: {
      warehouse: { merchantId },
      ...(options.variantIds ? { variantId: { in: options.variantIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 20,
    select: movementSelect,
  });
  return rows.map(mapMovement);
}

/**
 * Write one movement. Never an update: a correction to a correction is another
 * row, which is the whole point of an append-only ledger.
 */
export async function adjustStock(
  merchantId: string,
  input: CreateMovementInput,
): Promise<AdjustmentResult> {
  const [variant, warehouse] = await Promise.all([
    prisma.variant.findFirst({
      where: { id: input.variantId, product: { merchantId } },
      select: { id: true, sku: true },
    }),
    prisma.warehouse.findFirst({
      where: { id: input.warehouseId, merchantId },
      select: { id: true, code: true },
    }),
  ]);
  if (!variant) throw notFound('Variant');
  if (!warehouse) throw notFound('Warehouse');

  return prisma.$transaction(async (tx) => {
    // Without a qty column there is no row to lock, so the pair is locked by
    // name instead. Two adjustments against the same (variant, warehouse) now
    // serialise, which is what stops both of them reading 5 and both taking 3.
    // The lock is transaction-scoped: it releases on commit or rollback.
    const lockKey = `stock:${variant.id}:${warehouse.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const grouped = await tx.stockMovement.groupBy({
      by: ['variantId', 'warehouseId'],
      where: { variantId: variant.id, warehouseId: warehouse.id },
      _sum: { delta: true },
    });
    const [current] = deriveLevels(toDeltaRows(grouped), [variant.id], [warehouse.id]);
    const onHandBefore = current.byWarehouse[0].onHand;

    if (wouldGoNegative(onHandBefore, input.delta)) {
      throw new AppError(
        'INSUFFICIENT_STOCK',
        `${variant.sku} has ${onHandBefore} on hand in ${warehouse.code}; that adjustment would leave ${onHandBefore + input.delta}`,
        { onHand: onHandBefore, delta: input.delta },
      );
    }

    const movement = await tx.stockMovement.create({
      data: {
        variantId: variant.id,
        warehouseId: warehouse.id,
        delta: input.delta,
        reason: input.reason,
        note: input.note,
        refType: 'manual',
      },
      select: movementSelect,
    });

    const onHand = onHandBefore + input.delta;
    return {
      movement: mapMovement(movement),
      level: { variantId: variant.id, warehouseId: warehouse.id, onHand, lowStock: isLowStock(onHand) },
    };
  });
}
