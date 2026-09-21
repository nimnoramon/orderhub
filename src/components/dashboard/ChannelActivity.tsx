import Link from 'next/link';
import { formatDateTime } from '@/lib/dates';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import { JOB_TYPE_LABELS } from '@/components/sync/SyncJobsTable';
import type { DashboardSummary } from '@/lib/types';

type ChannelRow = DashboardSummary['channels'][number];

/**
 * The last run against one channel, or the reason there has never been one.
 *
 * "Never run" and "nothing to run" are different facts and the screen says
 * which: the storefront has no connector by definition — its orders originate
 * here — and a marketplace that has simply not been synced yet is a channel
 * somebody should probably click.
 */
function LastRun({ channel }: { channel: ChannelRow }) {
  if (channel.connector === 'none') {
    return <p className="text-sm text-neutral-400">Orders originate here — nothing to sync.</p>;
  }

  if (!channel.lastJob) {
    return <p className="text-sm text-neutral-400">Never run.</p>;
  }

  const job = channel.lastJob;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
      <SyncStatusPill status={job.status} />
      <span>{JOB_TYPE_LABELS[job.type]}</span>
      <span className="tabular-nums">
        {job.itemsOk} ok · {job.itemsFailed} failed
      </span>
      <span className="text-neutral-400">
        {job.startedAt ? formatDateTime(job.startedAt) : 'not started'}
      </span>
    </div>
  );
}

export function ChannelActivity({ channels }: { channels: DashboardSummary['channels'] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-baseline gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Channels</h2>
        <Link
          href="/channels"
          className="ml-auto text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          Sync now
        </Link>
      </header>

      <ul className="divide-y divide-neutral-100">
        {channels.map((channel) => (
          <li key={channel.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-neutral-900">{channel.name}</span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500">
                {channel.kind}
              </span>
            </div>
            <div className="mt-1.5">
              <LastRun channel={channel} />
            </div>
            {channel.connector !== 'none' && (
              // `lastSyncedAt` is how far the order feed has been read, which is
              // not the same thing as when a job last ran — a catalog push moves
              // one and not the other, so they are two lines and not one.
              <p className="mt-1 text-xs text-neutral-400">
                Feed read to{' '}
                {channel.lastSyncedAt ? formatDateTime(channel.lastSyncedAt) : 'the beginning'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
