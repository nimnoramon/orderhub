import { formatDateTime, formatDuration } from '@/lib/dates';
import { serverMessages } from '@/server/i18n/locale';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import { Failures } from '@/components/sync/Failures';
import type { SyncJobItem } from '@/lib/types';

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2.5 text-sm text-neutral-700';

export async function SyncJobsTable({ jobs }: { jobs: SyncJobItem[] }) {
  const t = await serverMessages();

  if (jobs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
        {t.syncLog.empty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-neutral-200 bg-neutral-50/60">
          <tr>
            <th className={TH}>{t.syncLog.table.started}</th>
            <th className={TH}>{t.syncLog.table.channel}</th>
            <th className={TH}>{t.syncLog.table.job}</th>
            <th className={TH}>{t.syncLog.table.status}</th>
            <th className={`${TH} text-right`}>{t.syncLog.table.ok}</th>
            <th className={`${TH} text-right`}>{t.syncLog.table.failed}</th>
            <th className={`${TH} text-right`}>{t.syncLog.table.took}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {jobs.map((job) => (
            <tr key={job.id} className="align-top">
              <td className={`${TD} whitespace-nowrap text-neutral-500`}>
                {job.startedAt ? formatDateTime(job.startedAt) : t.common.notStarted}
              </td>
              <td className={TD}>{job.channel.name}</td>
              <td className={`${TD} text-neutral-500`}>
                {t.jobType[job.type]}
                {job.attempt > 1 && (
                  <span className="ml-2 text-xs text-neutral-400">{t.common.attempt(job.attempt)}</span>
                )}
              </td>
              <td className={TD}>
                <SyncStatusPill status={job.status} />
                {job.failures.length > 0 && (
                  <div className="mt-2">
                    <Failures job={job} />
                  </div>
                )}
              </td>
              <td className={`${TD} text-right tabular-nums`}>{job.itemsOk}</td>
              <td
                className={`${TD} text-right tabular-nums ${job.itemsFailed > 0 ? 'text-amber-700' : 'text-neutral-400'}`}
              >
                {job.itemsFailed}
              </td>
              <td className={`${TD} whitespace-nowrap text-right tabular-nums text-neutral-500`}>
                {formatDuration(job.durationMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
