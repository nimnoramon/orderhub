import { formatDateTime, formatDuration } from '@/lib/dates';
import { SyncStatusPill } from '@/components/ui/StatusPill';
import type { SyncJobItem } from '@/lib/types';

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2.5 text-sm text-neutral-700';

export const JOB_TYPE_LABELS = {
  catalog_push: 'Catalog push',
  order_pull: 'Order pull',
} as const;

/**
 * The expandable detail is a `<details>` element rather than a click handler and
 * a piece of state. It keeps this whole screen a server component: no bundle, no
 * hydration, and the rows still open — which is the right trade for a log whose
 * only interaction is "show me what went wrong".
 */
function Failures({ job }: { job: SyncJobItem }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-neutral-500 hover:text-neutral-900">
        <span className="inline-block w-3 transition group-open:rotate-90">›</span>
        {job.itemsFailed} item{job.itemsFailed === 1 ? '' : 's'} failed
      </summary>
      <ul className="mt-2 ml-3 flex flex-col gap-1 border-l border-neutral-200 pl-3">
        {job.failures.map((failure, index) => (
          <li key={`${failure.ref}-${index}`} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="font-mono text-neutral-900">{failure.ref}</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600">
              {failure.code}
            </span>
            <span className="text-neutral-500">{failure.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SyncJobsTable({ jobs }: { jobs: SyncJobItem[] }) {
  if (jobs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
        No sync jobs match those filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-neutral-200 bg-neutral-50/60">
          <tr>
            <th className={TH}>Started</th>
            <th className={TH}>Channel</th>
            <th className={TH}>Job</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`}>Ok</th>
            <th className={`${TH} text-right`}>Failed</th>
            <th className={`${TH} text-right`}>Took</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {jobs.map((job) => (
            <tr key={job.id} className="align-top">
              <td className={`${TD} whitespace-nowrap text-neutral-500`}>
                {job.startedAt ? formatDateTime(job.startedAt) : 'not started'}
              </td>
              <td className={TD}>{job.channel.name}</td>
              <td className={`${TD} text-neutral-500`}>
                {JOB_TYPE_LABELS[job.type]}
                {job.attempt > 1 && (
                  <span className="ml-2 text-xs text-neutral-400">attempt {job.attempt}</span>
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
