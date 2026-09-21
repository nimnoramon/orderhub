import { formatDateTime } from '@/lib/dates';
import { serverMessages } from '@/server/i18n/locale';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import type { OrderEventItem } from '@/lib/types';

/**
 * The status history, oldest first. Like the stock ledger, `OrderEvent` rows are
 * only ever appended — this is the answer to "who moved this order, and when",
 * and it is why a transition writes an event in the same transaction as the
 * status change rather than after it.
 */
export async function OrderTimeline({ events }: { events: OrderEventItem[] }) {
  const t = await serverMessages();

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
        {t.orderDetail.timeline.empty}
      </p>
    );
  }

  return (
    <ol className="rounded-lg border border-neutral-200 bg-white">
      {events.map((event, index) => (
        <li
          key={event.id}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 ${
            index > 0 ? 'border-t border-neutral-100' : ''
          }`}
        >
          <span className="w-44 shrink-0 text-xs tabular-nums text-neutral-500">
            {formatDateTime(event.createdAt)}
          </span>

          <span className="flex items-center gap-2">
            {event.fromStatus ? (
              <>
                <OrderStatusPill status={event.fromStatus} />
                <span className="text-neutral-300">→</span>
              </>
            ) : (
              <span className="text-xs text-neutral-400">{t.orderDetail.timeline.placed}</span>
            )}
            <OrderStatusPill status={event.toStatus} />
          </span>

          <span className="text-xs text-neutral-500">{t.orderDetail.timeline.by(event.actor)}</span>
          {event.note && <span className="text-xs text-neutral-500">— {event.note}</span>}
        </li>
      ))}
    </ol>
  );
}
