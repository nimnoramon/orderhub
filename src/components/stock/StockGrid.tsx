'use client';

import { useState } from 'react';
import { formatCents } from '@/lib/money';
import { AdjustStockDialog } from '@/components/stock/AdjustStockDialog';
import type { VariantWithLevels, WarehouseRef } from '@/lib/types';

type Props = { variants: VariantWithLevels[]; warehouses: WarehouseRef[] };

type Target = { variant: VariantWithLevels; warehouse: WarehouseRef; onHand: number };

const TH = 'px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2.5 text-sm text-neutral-700';

const describe = (attributes: Record<string, string>) =>
  Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');

/**
 * Every number in this grid is SUM(delta) for that pair — there is no quantity
 * column to read. Each cell is a button because an adjustment is always made
 * against a specific warehouse, never against "the product".
 */
export function StockGrid({ variants, warehouses }: Props) {
  const [target, setTarget] = useState<Target | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full border-collapse">
          <thead className="border-b border-neutral-200 bg-neutral-50/60">
            <tr>
              <th className={`${TH} text-left`}>Variant</th>
              <th className={`${TH} text-right`}>Price</th>
              {warehouses.map((warehouse) => (
                <th key={warehouse.id} className={`${TH} text-right`} title={warehouse.name}>
                  {warehouse.code}
                </th>
              ))}
              <th className={`${TH} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {variants.map((variant) => (
              <tr key={variant.id} className="hover:bg-neutral-50/60">
                <td className={TD}>
                  <div className="font-mono text-xs text-neutral-900">{variant.sku}</div>
                  {Object.keys(variant.attributes).length > 0 && (
                    <div className="text-xs text-neutral-400">{describe(variant.attributes)}</div>
                  )}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {formatCents(variant.priceCents, variant.currency)}
                </td>

                {variant.levels.byWarehouse.map((cell) => {
                  const warehouse = warehouses.find((w) => w.id === cell.warehouseId)!;
                  return (
                    <td key={cell.warehouseId} className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setTarget({ variant, warehouse, onHand: cell.onHand })}
                        title={`Adjust ${variant.sku} in ${warehouse.name}`}
                        className={
                          cell.lowStock
                            ? 'w-16 rounded-md bg-amber-50 px-2 py-1 text-sm font-medium tabular-nums text-amber-800 ring-1 ring-inset ring-amber-600/20 hover:bg-amber-100'
                            : 'w-16 rounded-md px-2 py-1 text-sm tabular-nums text-neutral-700 hover:bg-neutral-100'
                        }
                      >
                        {cell.onHand}
                      </button>
                    </td>
                  );
                })}

                <td className={`${TD} text-right font-medium tabular-nums text-neutral-900`}>
                  {variant.levels.onHand}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="pt-2 text-xs text-neutral-400">
        Click any cell to write an adjustment. Amber marks a warehouse at or below the low-stock
        threshold.
      </p>

      {target && (
        <AdjustStockDialog
          key={`${target.variant.id}:${target.warehouse.id}`}
          variant={target.variant}
          warehouse={target.warehouse}
          onHand={target.onHand}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
