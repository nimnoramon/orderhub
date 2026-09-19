import Link from 'next/link';
import { formatCents } from '@/lib/money';
import type { OrderDetail } from '@/lib/types';

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2.5 text-sm text-neutral-700';

const describe = (attributes: Record<string, string>) => Object.values(attributes).join(' · ');

export function OrderItemsTable({ order }: { order: OrderDetail }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-neutral-200 bg-neutral-50/60">
          <tr>
            <th className={TH}>Item</th>
            <th className={TH}>SKU</th>
            <th className={`${TH} text-right`}>Qty</th>
            <th className={`${TH} text-right`}>Unit</th>
            <th className={`${TH} text-right`}>Line total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className={TD}>
                <Link href={`/products/${item.productId}`} className="hover:underline">
                  {item.productName}
                </Link>
                {describe(item.attributes) && (
                  <span className="ml-2 text-xs text-neutral-400">{describe(item.attributes)}</span>
                )}
              </td>
              <td className={`${TD} font-mono text-xs text-neutral-500`}>{item.variantSku}</td>
              <td className={`${TD} text-right tabular-nums`}>{item.qty}</td>
              <td className={`${TD} text-right tabular-nums text-neutral-500`}>
                {formatCents(item.unitPriceCents, order.currency)}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatCents(item.lineTotalCents, order.currency)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-neutral-200 bg-neutral-50/60">
          <tr>
            <td className={`${TD} font-medium text-neutral-900`} colSpan={4}>
              Order total
            </td>
            <td className={`${TD} text-right font-semibold tabular-nums text-neutral-900`}>
              {formatCents(order.totalCents, order.currency)}
            </td>
          </tr>
          {/* The channel's total is what was charged; if the lines do not add up
              to it, say so rather than silently showing whichever is prettier. */}
          {order.lineTotalCents !== order.totalCents && (
            <tr>
              <td className={`${TD} text-xs text-neutral-500`} colSpan={5}>
                Lines sum to {formatCents(order.lineTotalCents, order.currency)} — the channel
                charged {formatCents(order.totalCents, order.currency)}.
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
