import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { requireMerchantId } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { getOrder } from '@/server/services/orders';
import { OrderItemsTable } from '@/components/orders/OrderItemsTable';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { TransitionActions } from '@/components/orders/TransitionActions';
import { OrderStatusPill } from '@/components/ui/StatusPill';

export const dynamic = 'force-dynamic';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const merchantId = await requireMerchantId();
  const { id } = await params;

  const order = await getOrder(merchantId, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const units = order.items.reduce((total, item) => total + item.qty, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/orders" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-semibold tracking-tight text-neutral-900">
            {order.reference}
          </h1>
          <OrderStatusPill status={order.status} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {order.customerName} · {order.channel.name} · placed {formatDateTime(order.placedAt)}
          {/* Storefront orders carry no external id, by design — see the schema. */}
          {!order.externalId && <span className="ml-1 text-neutral-400">(no channel id)</span>}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total" value={formatCents(order.totalCents, order.currency)} />
        <Stat label="Items" value={units} />
        <Stat label="Status changes" value={order.timeline.length} />
      </dl>

      <TransitionActions orderId={order.id} status={order.status} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Items</h2>
        <OrderItemsTable order={order} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Timeline</h2>
        <OrderTimeline events={order.timeline} />
      </section>
    </div>
  );
}
