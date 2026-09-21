import Link from 'next/link';
import { formatDateTime } from '@/lib/dates';
import { serverMessages } from '@/server/i18n/locale';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import { Failures } from '@/components/sync/Failures';
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
export async function RecentFailures({ failures }: { failures: SyncJobItem[] }) {
  const t = await serverMessages();

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-baseline gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{t.overview.failures.title}</h2>
        <Link
          href="/sync-log"
          className="ml-auto text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          {t.overview.failures.fullLog}
        </Link>
      </header>

      {failures.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500">
          {t.overview.failures.emptyLead}{' '}
          <span className="font-medium text-amber-700">{t.syncStatus.partial}</span>{' '}
          {t.overview.failures.emptyMid}{' '}
          <span className="font-medium text-rose-700">{t.syncStatus.failed}</span>{' '}
          {t.overview.failures.emptyTail}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {failures.map((job) => (
            <li key={job.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <SyncStatusPill status={job.status} />
                <span className="font-medium text-neutral-900">{job.channel.name}</span>
                <span>{t.jobType[job.type]}</span>
                {job.attempt > 1 && (
                  <span className="text-xs text-neutral-400">{t.common.attempt(job.attempt)}</span>
                )}
                <span className="ml-auto text-xs text-neutral-400">
                  {job.startedAt ? formatDateTime(job.startedAt) : t.common.notStarted}
                </span>
              </div>
              <p className="mt-1 text-xs tabular-nums text-neutral-500">
                {t.overview.failures.delivered(job.itemsOk, job.itemsFailed)}
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
