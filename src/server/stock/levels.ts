import type { VariantLevels, WarehouseLevel } from '@/lib/types';

/**
 * Stock levels, derived. This module is the definition of the arithmetic: stock
 * on hand is SUM(delta) grouped by (variantId, warehouseId), and nothing else in
 * the app is allowed to compute it another way.
 *
 * It is deliberately pure — no Prisma, no HTTP — for two reasons. It is the part
 * that has to be right, so it is the part that gets unit tests without a database
 * behind them; and it accepts *any* set of delta rows, which lets the two call
 * paths share it:
 *
 *   - product detail passes raw StockMovement rows for one product;
 *   - list views pass rows that Postgres has already summed with GROUP BY.
 *
 * Summing a set that is already one row per pair returns that row, so the SQL
 * aggregation is a performance step and not a second implementation of the
 * maths. That equivalence is asserted in tests/stock-levels.test.ts.
 */

/** Ten or fewer units in a single warehouse counts as low. */
export const LOW_STOCK_THRESHOLD = 10;

export type DeltaRow = { variantId: string; warehouseId: string; delta: number };

const keyOf = (variantId: string, warehouseId: string) => `${variantId}\u0000${warehouseId}`;

export const isLowStock = (onHand: number): boolean => onHand <= LOW_STOCK_THRESHOLD;

/**
 * Levels for every requested (variant, warehouse) pair.
 *
 * `warehouseIds` is required rather than inferred from the rows: a pair with no
 * movements has a level of zero, and a grid that silently omits that cell is
 * indistinguishable from one whose query dropped it.
 */
export function deriveLevels(
  rows: readonly DeltaRow[],
  variantIds: readonly string[],
  warehouseIds: readonly string[],
): VariantLevels[] {
  const sums = new Map<string, number>();
  const wanted = new Set(variantIds);

  for (const row of rows) {
    if (!wanted.has(row.variantId)) continue;
    const key = keyOf(row.variantId, row.warehouseId);
    sums.set(key, (sums.get(key) ?? 0) + row.delta);
  }

  return variantIds.map((variantId) => {
    const byWarehouse: WarehouseLevel[] = warehouseIds.map((warehouseId) => {
      const onHand = sums.get(keyOf(variantId, warehouseId)) ?? 0;
      return { warehouseId, onHand, lowStock: isLowStock(onHand) };
    });

    return {
      variantId,
      byWarehouse,
      onHand: byWarehouse.reduce((total, cell) => total + cell.onHand, 0),
      // A variant with 400 in Rotterdam and 2 in Singapore still cannot fill a
      // Singapore order, so the variant is flagged when any one warehouse is low
      // rather than when the total is. Per-warehouse reorder points would be a
      // real column; this demo has one threshold and says so.
      lowStock: byWarehouse.some((cell) => cell.lowStock),
    };
  });
}

/** The level of a single pair. Same maths, narrowed. */
export function onHandFor(
  rows: readonly DeltaRow[],
  variantId: string,
  warehouseId: string,
): number {
  return rows.reduce(
    (total, row) =>
      row.variantId === variantId && row.warehouseId === warehouseId ? total + row.delta : total,
    0,
  );
}

/**
 * The service's oversell guard, kept here with the rest of the maths.
 *
 * The ledger itself permits a negative level — a sale can land against a pair
 * whose opening balance was never recorded — but a manual adjustment that would
 * drive a pair further below zero is almost always a mistyped count, so the
 * service refuses it. A positive delta is never blocked: the way out of a
 * negative level is to add stock back, and a guard that forbade that would trap
 * the pair below zero forever.
 */
export const wouldGoNegative = (onHand: number, delta: number): boolean =>
  delta < 0 && onHand + delta < 0;
