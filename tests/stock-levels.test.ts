import { describe, expect, it } from 'vitest';
import {
  LOW_STOCK_THRESHOLD,
  deriveLevels,
  isLowStock,
  onHandFor,
  wouldGoNegative,
  type DeltaRow,
} from '@/server/stock/levels';

const V1 = 'variant-1';
const V2 = 'variant-2';
const RTM = 'wh-rotterdam';
const SIN = 'wh-singapore';
const ORD = 'wh-chicago';
const ALL = [RTM, SIN, ORD];

const row = (variantId: string, warehouseId: string, delta: number): DeltaRow => ({
  variantId,
  warehouseId,
  delta,
});

/** Levels for one variant/warehouse pair, for readability in the assertions. */
const levelOf = (levels: ReturnType<typeof deriveLevels>, variantId: string, warehouseId: string) =>
  levels.find((l) => l.variantId === variantId)!.byWarehouse.find((w) => w.warehouseId === warehouseId)!
    .onHand;

describe('deriveLevels', () => {
  it('sums the deltas of one pair', () => {
    const [level] = deriveLevels([row(V1, RTM, 100), row(V1, RTM, 25)], [V1], [RTM]);
    expect(level.onHand).toBe(125);
  });

  it('subtracts negative deltas — a sale and a return net out', () => {
    const [level] = deriveLevels(
      [row(V1, RTM, 100), row(V1, RTM, -3), row(V1, RTM, -2), row(V1, RTM, 3)],
      [V1],
      [RTM],
    );
    expect(level.onHand).toBe(98);
  });

  it('is order-independent', () => {
    const movements = [row(V1, RTM, 40), row(V1, RTM, -15), row(V1, RTM, 7)];
    const forwards = deriveLevels(movements, [V1], [RTM])[0].onHand;
    const backwards = deriveLevels([...movements].reverse(), [V1], [RTM])[0].onHand;
    expect(forwards).toBe(backwards);
  });

  it('returns zero for movements that net to zero, rather than omitting the pair', () => {
    const [level] = deriveLevels([row(V1, RTM, 12), row(V1, RTM, -12)], [V1], [RTM]);
    expect(level.byWarehouse).toHaveLength(1);
    expect(level.onHand).toBe(0);
  });

  it('keeps warehouses independent and totals them', () => {
    const levels = deriveLevels(
      [row(V1, RTM, 100), row(V1, SIN, 40), row(V1, SIN, -10), row(V1, ORD, 5)],
      [V1],
      ALL,
    );
    expect(levelOf(levels, V1, RTM)).toBe(100);
    expect(levelOf(levels, V1, SIN)).toBe(30);
    expect(levelOf(levels, V1, ORD)).toBe(5);
    expect(levels[0].onHand).toBe(135);
  });

  it('reports zero for a warehouse the variant has never had a movement in', () => {
    // The bug this guards against: GROUP BY returns no row for an untouched
    // pair, and a grid that omits the cell looks like a failed query.
    const levels = deriveLevels([row(V1, RTM, 80)], [V1], ALL);
    expect(levels[0].byWarehouse.map((w) => w.onHand)).toEqual([80, 0, 0]);
  });

  it('returns a full row of zeros for a variant with no movements at all', () => {
    const levels = deriveLevels([], [V1, V2], ALL);
    expect(levels).toHaveLength(2);
    expect(levels.every((l) => l.onHand === 0)).toBe(true);
    expect(levels[1].byWarehouse).toHaveLength(3);
  });

  it('ignores rows belonging to variants that were not asked for', () => {
    const levels = deriveLevels([row(V1, RTM, 10), row(V2, RTM, 999)], [V1], [RTM]);
    expect(levels).toHaveLength(1);
    expect(levels[0].onHand).toBe(10);
  });

  it('ignores warehouses outside the requested set — this is what ?warehouseId= filters on', () => {
    const levels = deriveLevels([row(V1, RTM, 10), row(V1, SIN, 999)], [V1], [RTM]);
    expect(levels[0].onHand).toBe(10);
  });

  it('permits a negative level: the ledger records reality, the service decides policy', () => {
    const [level] = deriveLevels([row(V1, RTM, 2), row(V1, RTM, -5)], [V1], [RTM]);
    expect(level.onHand).toBe(-3);
  });

  it('preserves the requested variant and warehouse order', () => {
    const levels = deriveLevels([], [V2, V1], [SIN, RTM]);
    expect(levels.map((l) => l.variantId)).toEqual([V2, V1]);
    expect(levels[0].byWarehouse.map((w) => w.warehouseId)).toEqual([SIN, RTM]);
  });

  it('gives the same answer for raw movements and for rows Postgres has already summed', () => {
    // The equivalence the two call paths rely on: GROUP BY is an optimisation,
    // not a second implementation of the arithmetic.
    const raw = [
      row(V1, RTM, 100),
      row(V1, RTM, -4),
      row(V1, SIN, 30),
      row(V2, SIN, 12),
      row(V2, ORD, -2),
    ];
    const preAggregated = [row(V1, RTM, 96), row(V1, SIN, 30), row(V2, SIN, 12), row(V2, ORD, -2)];

    expect(deriveLevels(raw, [V1, V2], ALL)).toEqual(deriveLevels(preAggregated, [V1, V2], ALL));
  });
});

describe('low stock', () => {
  it('flags a level at the threshold and clears one above it', () => {
    expect(isLowStock(LOW_STOCK_THRESHOLD)).toBe(true);
    expect(isLowStock(LOW_STOCK_THRESHOLD + 1)).toBe(false);
    expect(isLowStock(0)).toBe(true);
    expect(isLowStock(-1)).toBe(true);
  });

  it('flags the variant when any single warehouse is low, however healthy the total', () => {
    const [level] = deriveLevels([row(V1, RTM, 400), row(V1, SIN, 2)], [V1], [RTM, SIN]);
    expect(level.onHand).toBe(402);
    expect(level.lowStock).toBe(true);
    expect(level.byWarehouse.map((w) => w.lowStock)).toEqual([false, true]);
  });

  it('does not flag a variant whose warehouses are all above the threshold', () => {
    const [level] = deriveLevels([row(V1, RTM, 11), row(V1, SIN, 11), row(V1, ORD, 11)], [V1], ALL);
    expect(level.lowStock).toBe(false);
  });
});

describe('onHandFor', () => {
  it('narrows to a single pair', () => {
    const rows = [row(V1, RTM, 10), row(V1, SIN, 4), row(V2, RTM, 7)];
    expect(onHandFor(rows, V1, RTM)).toBe(10);
    expect(onHandFor(rows, V1, ORD)).toBe(0);
  });
});

describe('wouldGoNegative', () => {
  it('allows an adjustment that lands exactly on zero', () => {
    expect(wouldGoNegative(3, -3)).toBe(false);
  });

  it('rejects one that goes below zero', () => {
    expect(wouldGoNegative(3, -4)).toBe(true);
  });

  it('never blocks a positive delta, including from an already-negative level', () => {
    expect(wouldGoNegative(-5, 2)).toBe(false);
    expect(wouldGoNegative(0, 50)).toBe(false);
  });
});
