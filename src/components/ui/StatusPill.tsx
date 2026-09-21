import type { OrderStatus, ProductStatus, SyncJobStatus } from '@/generated/prisma/enums';
import { serverMessages } from '@/server/i18n/locale';

/**
 * The pills read their own label out of the request's dictionary rather than
 * taking one as a prop, which would have meant threading a string through nine
 * call sites. The cost is that they are server components — `serverMessages`
 * reads a cookie — and every screen that renders a pill already is one. A
 * client component that needs a status word asks `useT()` for the same key.
 */

const PILL = 'inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset';

const STYLES: Record<ProductStatus, string> = {
  active: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  draft: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  archived: 'bg-neutral-100 text-neutral-400 ring-neutral-400/20',
};

export async function StatusPill({ status }: { status: ProductStatus }) {
  const t = await serverMessages();
  return <span className={`${PILL} ${STYLES[status]}`}>{t.productStatus[status]}</span>;
}

/** Colour follows the lifecycle: nothing yet, money in, moving, gone, stopped. */
const ORDER_STYLES: Record<OrderStatus, string> = {
  created: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  paid: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  packed: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  shipped: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  cancelled: 'bg-rose-50 text-rose-800 ring-rose-600/20',
};

export async function OrderStatusPill({ status }: { status: OrderStatus }) {
  const t = await serverMessages();
  return <span className={`${PILL} ${ORDER_STYLES[status]}`}>{t.orderStatus[status]}</span>;
}

/**
 * The same lifecycle colours as solid fills, for the overview's proportion bar.
 * They live beside the pills rather than in the chart that uses them so that a
 * status has one colour in the whole app — a legend that disagrees with the bar
 * it labels is worse than no legend.
 */
export const ORDER_BAR: Record<OrderStatus, string> = {
  created: 'bg-neutral-300',
  paid: 'bg-sky-400',
  packed: 'bg-amber-400',
  shipped: 'bg-teal-600',
  cancelled: 'bg-rose-400',
};

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

export async function SyncStatusPill({ status }: { status: SyncJobStatus }) {
  const t = await serverMessages();
  return <span className={`${PILL} ${SYNC_STYLES[status]}`}>{t.syncStatus[status]}</span>;
}

export async function LowStockPill() {
  const t = await serverMessages();
  return (
    <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
      {t.products.low}
    </span>
  );
}
