import Link from 'next/link';
import { formatDateTime, formatDuration } from '@/lib/dates';
import { serverMessages } from '@/server/i18n/locale';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import { SyncButton } from '@/components/channels/SyncButton';
import type { Messages } from '@/lib/i18n';
import type { ChannelSummary, SyncJobItem } from '@/lib/types';

const FACT = 'text-xs text-neutral-400';

/** The last run of one kind, or an honest blank. */
function LastRun({ job, t }: { job: SyncJobItem | null; t: Messages }) {
  if (!job) return <p className="text-sm text-neutral-400">{t.common.neverRun}</p>;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
      <SyncStatusPill status={job.status} />
      <span className="tabular-nums">{t.common.okFailed(job.itemsOk, job.itemsFailed)}</span>
      <span className="text-neutral-400">
        {job.startedAt ? formatDateTime(job.startedAt) : '—'}
      </span>
    </div>
  );
}

/**
 * What is waiting to be pushed again, and the button that does it.
 *
 * The queue is the visible half of the retry design, so an empty one says so
 * rather than rendering nothing — "no items waiting" and "this feature does not
 * exist" look identical otherwise, and only one of them is true.
 */
function RetryQueue({
  channel,
  disabled,
  t,
}: {
  channel: ChannelSummary;
  disabled: boolean;
  t: Messages;
}) {
  const { depth, nextDueAt } = channel.retryQueue;

  if (depth === 0) {
    return <p className={FACT}>{t.channels.retry.nothingQueued}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <p className="text-xs text-amber-800">
        {t.channels.retry.queued(depth)}
        {nextDueAt && t.channels.retry.nextDue(formatDateTime(nextDueAt))}
      </p>
      <SyncButton channelId={channel.id} type="catalog_retry" disabled={disabled} />
    </div>
  );
}

/**
 * Where the feed has been read to. The cursor moves only once a whole page has
 * been written, so what it says here is where the next run will start — and
 * clicking twice reads the same page again rather than skipping one.
 */
function Cursor({ channel, t }: { channel: ChannelSummary; t: Messages }) {
  return (
    <>
      {t.channels.cursorLabel}{' '}
      <span className="font-mono text-neutral-500">{channel.cursor ?? t.common.none}</span>
      {t.channels.lastRead(
        channel.lastSyncedAt ? formatDateTime(channel.lastSyncedAt) : t.common.never,
      )}
    </>
  );
}

export async function ChannelCard({ channel }: { channel: ChannelSummary }) {
  const t = await serverMessages();
  const syncable = channel.connector === 'ready' && channel.isActive;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{channel.name}</h2>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500">
          {channel.kind}
        </span>
        <span
          className={
            channel.isActive
              ? 'rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-600/20'
              : 'rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500 ring-1 ring-inset ring-neutral-500/20'
          }
        >
          {channel.isActive ? t.channels.connected : t.channels.disconnected}
        </span>
        <Link
          href={`/orders?channelId=${channel.id}`}
          className="ml-auto text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          {t.channels.orderCount(channel.orderCount)}
        </Link>
      </header>

      {channel.connector === 'ready' ? (
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <p className={FACT}>{t.channels.catalogPush}</p>
            <div className="mt-1.5 flex flex-col gap-2">
              <LastRun job={channel.lastJobs.catalog_push} t={t} />
              <SyncButton channelId={channel.id} type="catalog_push" disabled={!syncable} />
              <RetryQueue channel={channel} disabled={!syncable} t={t} />
            </div>
          </div>

          <div>
            <p className={FACT}>{t.channels.orderPull}</p>
            <div className="mt-1.5 flex flex-col gap-2">
              <LastRun job={channel.lastJobs.order_pull} t={t} />
              <div className="flex flex-col items-start gap-1.5">
                <SyncButton channelId={channel.id} type="order_pull" disabled={!syncable} />
                <p className="text-xs text-neutral-400">
                  <Cursor channel={channel} t={t} />
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : channel.connector === 'planned' ? (
        <div className="px-4 py-4">
          <p className="text-sm text-neutral-500">{t.channels.planned}</p>
          <p className="mt-2 text-xs text-neutral-400">
            <Cursor channel={channel} t={t} />
          </p>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-neutral-500">{t.channels.storefront}</p>
      )}

      {channel.limiter && (
        <footer className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-400">
          {/* A token bucket in Redis, spent before every outbound call. Showing
              what is left of it turns "we respect their rate limit" from a claim
              in a README into a number on a screen. */}
          {t.channels.limiter.lead}{' '}
          <span className="tabular-nums text-neutral-600">
            {channel.limiter.remaining}/{channel.limiter.capacity}
          </span>{' '}
          {t.channels.limiter.tokens}
          {channel.limiter.nextTokenInMs > 0 &&
            t.channels.limiter.nextIn(formatDuration(channel.limiter.nextTokenInMs))}{' '}
          {t.channels.limiter.tail}
        </footer>
      )}
    </section>
  );
}
