import Link from 'next/link';
import { formatDateTime } from '@/lib/dates';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import { Failures } from '@/components/sync/Failures';
import { JOB_TYPE_LABELS } from '@/components/sync/SyncJobsTable';
import type { SyncJobItem } from '@/lib/types';

/**
 * The runs that did not go cleanly, most recent first.
 *
 * `partial` belongs on this list as much as `failed` does. A run that delivered
 * eighty-one listings and could not deliver six is the case this project is
 * built around, and a dashboard that only surfaced total failures would hide
 * every one of them — the six items would sit in the log unread while the
 * channel card said the last push went fine.
 */
export function RecentFailures({ failures }: { failures: SyncJobItem[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-baseline gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Recent failures</h2>
        <Link
          href="/sync-log"
          className="ml-auto text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          Full sync log
        </Link>
      </header>

      {failures.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500">
          No run has ended <span className="font-medium text-amber-700">partial</span> or{' '}
          <span className="font-medium text-rose-700">failed</span> yet.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {failures.map((job) => (
            <li key={job.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <SyncStatusPill status={job.status} />
                <span className="font-medium text-neutral-900">{job.channel.name}</span>
                <span>{JOB_TYPE_LABELS[job.type]}</span>
                {job.attempt > 1 && (
                  <span className="text-xs text-neutral-400">attempt {job.attempt}</span>
                )}
                <span className="ml-auto text-xs text-neutral-400">
                  {job.startedAt ? formatDateTime(job.startedAt) : 'not started'}
                </span>
              </div>
              <p className="mt-1 text-xs tabular-nums text-neutral-500">
                {job.itemsOk} delivered · {job.itemsFailed} not
              </p>
              {job.failures.length > 0 && (
                <div className="mt-2">
                  <Failures job={job} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
