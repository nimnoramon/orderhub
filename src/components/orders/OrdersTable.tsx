import Link from 'next/link';
import { formatDate } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import type { OrderListItem } from '@/lib/types';

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2.5 text-sm text-neutral-700';

export function OrdersTable({ orders }: { orders: OrderListItem[] }) {
  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
        No orders match those filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-neutral-200 bg-neutral-50/60">
          <tr>
            <th className={TH}>Order</th>
            <th className={TH}>Channel</th>
            <th className={TH}>Customer</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`}>Items</th>
            <th className={`${TH} text-right`}>Total</th>
            <th className={`${TH} text-right`}>Placed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {orders.map((order) => (
            <tr key={order.id} className="relative hover:bg-neutral-50">
              <td className={`${TD} font-mono text-xs font-medium text-neutral-900`}>
                {/* Stretched link: the whole row is the click target, without
                    nesting interactive elements inside one another. */}
                <Link href={`/orders/${order.id}`} className="after:absolute after:inset-0">
                  {order.reference}
                </Link>
              </td>
              <td className={`${TD} text-neutral-500`}>{order.channel.name}</td>
              <td className={TD}>{order.customerName}</td>
              <td className={TD}>
                <OrderStatusPill status={order.status} />
              </td>
              <td className={`${TD} text-right tabular-nums text-neutral-500`}>{order.itemCount}</td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatCents(order.totalCents, order.currency)}
              </td>
              <td className={`${TD} whitespace-nowrap text-right text-neutral-500`}>
                {formatDate(order.placedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
