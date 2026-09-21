import Link from 'next/link';
import { formatDateTime } from '@/lib/dates';
import { serverMessages } from '@/server/i18n/locale';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import type { Messages } from '@/lib/i18n';
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
function LastRun({ channel, t }: { channel: ChannelRow; t: Messages }) {
  if (channel.connector === 'none') {
    return <p className="text-sm text-neutral-400">{t.overview.activity.nothingToSync}</p>;
  }

  if (!channel.lastJob) {
    return <p className="text-sm text-neutral-400">{t.overview.activity.neverRun}</p>;
  }

  const job = channel.lastJob;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
      <SyncStatusPill status={job.status} />
      <span>{t.jobType[job.type]}</span>
      <span className="tabular-nums">{t.common.okFailed(job.itemsOk, job.itemsFailed)}</span>
      <span className="text-neutral-400">
        {job.startedAt ? formatDateTime(job.startedAt) : t.common.notStarted}
      </span>
    </div>
  );
}

export async function ChannelActivity({ channels }: { channels: DashboardSummary['channels'] }) {
  const t = await serverMessages();

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-baseline gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{t.overview.activity.title}</h2>
        <Link
          href="/channels"
          className="ml-auto text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          {t.overview.activity.syncNow}
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
              <LastRun channel={channel} t={t} />
            </div>
            {channel.connector !== 'none' && (
              // `lastSyncedAt` is how far the order feed has been read, which is
              // not the same thing as when a job last ran — a catalog push moves
              // one and not the other, so they are two lines and not one.
              <p className="mt-1 text-xs text-neutral-400">
                {t.overview.activity.feedReadTo(
                  channel.lastSyncedAt
                    ? formatDateTime(channel.lastSyncedAt)
                    : t.overview.activity.theBeginning,
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
