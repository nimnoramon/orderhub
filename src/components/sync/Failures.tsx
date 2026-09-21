import type { SyncJobItem } from '@/lib/types';

/**
 * The per-item failures of one run, collapsed.
 *
 * A `<details>` element rather than a click handler and a piece of state. It
 * keeps every screen that shows failures a server component — no bundle, no
 * hydration — and the rows still open, which is the right trade for a log whose
 * only interaction is "show me what went wrong".
 *
 * It has its own file because the sync log and the overview both show it, and a
 * second copy would be free to disagree about what a failure looks like.
 */
export function Failures({ job }: { job: SyncJobItem }) {
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
