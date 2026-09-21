import Link from 'next/link';
import { formatDateTime } from '@/lib/dates';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import { SyncButton } from '@/components/channels/SyncButton';
import type { ChannelSummary, SyncJobItem } from '@/lib/types';

const FACT = 'text-xs text-neutral-400';

/** The last run of one kind, or an honest blank. */
function LastRun({ job }: { job: SyncJobItem | null }) {
  if (!job) return <p className="text-sm text-neutral-400">Never run</p>;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
      <SyncStatusPill status={job.status} />
      <span className="tabular-nums">
        {job.itemsOk} ok · {job.itemsFailed} failed
      </span>
      <span className="text-neutral-400">
        {job.startedAt ? formatDateTime(job.startedAt) : '—'}
      </span>
    </div>
  );
}

export function ChannelCard({ channel }: { channel: ChannelSummary }) {
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
          {channel.isActive ? 'connected' : 'disconnected'}
        </span>
        <Link
          href={`/orders?channelId=${channel.id}`}
          className="ml-auto text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          {channel.orderCount} order{channel.orderCount === 1 ? '' : 's'}
        </Link>
      </header>

      {channel.connector === 'ready' ? (
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <p className={FACT}>Catalog push</p>
            <div className="mt-1.5 flex flex-col gap-2">
              <LastRun job={channel.lastJobs.catalog_push} />
              <SyncButton channelId={channel.id} type="catalog_push" disabled={!syncable} />
            </div>
          </div>

          <div>
            <p className={FACT}>Order pull</p>
            <div className="mt-1.5 flex flex-col gap-2">
              <LastRun job={channel.lastJobs.order_pull} />
              <div className="flex flex-col items-start gap-1.5">
                <SyncButton channelId={channel.id} type="order_pull" disabled={!syncable} />
                <p className="text-xs text-neutral-400">
                  {/* The cursor moves only once a whole page has been written, so
                      what it says here is where the next run will start — and
                      clicking twice reads the same page again rather than
                      skipping one. */}
                  Cursor{' '}
                  <span className="font-mono text-neutral-500">{channel.cursor ?? 'none'}</span> ·
                  last read{' '}
                  {channel.lastSyncedAt ? formatDateTime(channel.lastSyncedAt) : 'never'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : channel.connector === 'planned' ? (
        <div className="px-4 py-4">
          <p className="text-sm text-neutral-500">
            This marketplace has no adapter yet, so there is nothing to push to it and no feed to
            read. Its orders were seeded so the rest of the app has something to show.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Cursor <span className="font-mono text-neutral-500">{channel.cursor ?? 'none'}</span> ·
            last read {channel.lastSyncedAt ? formatDateTime(channel.lastSyncedAt) : 'never'}
          </p>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-neutral-500">
          Orders originate here, so there is no catalog to push and no feed to read. A channel
          without a connector is a deliberate case, not a missing one.
        </p>
      )}
    </section>
  );
}
