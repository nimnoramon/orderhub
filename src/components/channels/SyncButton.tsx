'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RetryRunResult, SyncJobItem } from '@/lib/types';
import type { SyncJobType } from '@/generated/prisma/enums';

/**
 * Starts a sync and says what came back.
 *
 * The endpoint answers with the finished job for every outcome it managed to
 * record, so the interesting case is not the error path — it is a 200 whose body
 * says `partial`. Reporting that as a success would hide exactly the thing this
 * screen exists to show, so the summary below reads the job's own status rather
 * than the HTTP one.
 *
 * One component for all three actions because they differ only in wording and in
 * how their body is unwrapped: three copies would drift into disagreeing about
 * what a partial run looks like.
 */

/** A retry is not a `SyncJobType` — it is a catalog push the queue asked for. */
export type SyncAction = SyncJobType | 'catalog_retry';

type Read = { job: SyncJobItem | null; note: string | null };

const SYNCS = {
  catalog_push: {
    path: 'catalog',
    idle: 'Sync catalog',
    busy: 'Pushing…',
    primary: true,
    read: (body: unknown): Read => ({ job: body as SyncJobItem, note: null }),
    summary: (job: SyncJobItem) => `${job.itemsOk} accepted, ${job.itemsFailed} rejected`,
  },
  order_pull: {
    path: 'orders',
    idle: 'Pull orders',
    busy: 'Reading…',
    primary: true,
    read: (body: unknown): Read => ({ job: body as SyncJobItem, note: null }),
    summary: (job: SyncJobItem) => `${job.itemsOk} orders read, ${job.itemsFailed} failed`,
  },
  catalog_retry: {
    path: 'retries',
    idle: 'Run retries',
    busy: 'Retrying…',
    primary: false,
    // The only action that can succeed without running a job at all: an empty
    // or not-yet-due queue is a 200 with a sentence rather than a result.
    read: (body: unknown): Read => {
      const result = body as RetryRunResult;
      return { job: result.job, note: result.note };
    },
    summary: (job: SyncJobItem) => `${job.itemsOk} accepted, ${job.itemsFailed} still failing`,
  },
} as const satisfies Record<SyncAction, unknown>;

export function SyncButton({
  channelId,
  type,
  disabled,
}: {
  channelId: string;
  type: SyncAction;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<SyncJobItem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = SYNCS[type];

  async function run() {
    setBusy(true);
    setError(null);
    setJob(null);
    setNote(null);

    const response = await fetch(`/api/channels/${channelId}/sync/${copy.path}`, { method: 'POST' });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // 4xx only: no job was started, and the body says why.
      setError(body?.error?.message ?? 'The sync could not be started');
    } else {
      const result = copy.read(body);
      setJob(result.job);
      setNote(result.note);
      router.refresh();
    }
    setBusy(false);
  }

  const tone =
    job?.status === 'succeeded'
      ? 'text-teal-800'
      : job?.status === 'partial'
        ? 'text-amber-800'
        : 'text-rose-700';

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={disabled || busy}
        className={
          copy.primary
            ? 'rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400'
            : 'rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300'
        }
      >
        {busy ? copy.busy : copy.idle}
      </button>

      {job && (
        <p className={`text-xs ${tone}`}>
          {job.status} — {copy.summary(job)}
          {job.attempt > 1 && ` (attempt ${job.attempt})`}.{' '}
          <Link href="/sync-log" className="underline underline-offset-2">
            Open the log
          </Link>
        </p>
      )}

      {!job && note && <p className="text-xs text-neutral-500">{note}</p>}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
