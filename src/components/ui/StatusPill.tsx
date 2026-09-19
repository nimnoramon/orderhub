import type { OrderStatus, ProductStatus, SyncJobStatus } from '@/generated/prisma/enums';

const PILL = 'inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset';

const STYLES: Record<ProductStatus, string> = {
  active: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  draft: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  archived: 'bg-neutral-100 text-neutral-400 ring-neutral-400/20',
};

export function StatusPill({ status }: { status: ProductStatus }) {
  return <span className={`${PILL} ${STYLES[status]}`}>{status}</span>;
}

/** Colour follows the lifecycle: nothing yet, money in, moving, gone, stopped. */
const ORDER_STYLES: Record<OrderStatus, string> = {
  created: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  paid: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  packed: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  shipped: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  cancelled: 'bg-rose-50 text-rose-800 ring-rose-600/20',
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <span className={`${PILL} ${ORDER_STYLES[status]}`}>{status}</span>;
}

/**
 * `partial` is amber rather than red on purpose: the run worked, and some of its
 * items did not. Colouring it as a failure would teach the person reading the
 * log to ignore the distinction the whole sync model is built around.
 */
const SYNC_STYLES: Record<SyncJobStatus, string> = {
  queued: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  running: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  succeeded: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  partial: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  failed: 'bg-rose-50 text-rose-800 ring-rose-600/20',
};

export function SyncStatusPill({ status }: { status: SyncJobStatus }) {
  return <span className={`${PILL} ${SYNC_STYLES[status]}`}>{status}</span>;
}

export function LowStockPill() {
  return (
    <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
      low
    </span>
  );
}
