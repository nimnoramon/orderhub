'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SyncJobItem } from '@/lib/types';

/**
 * Starts a catalog push and says what came back.
 *
 * The endpoint answers with the finished job for every outcome it managed to
 * record, so the interesting case is not the error path — it is a 200 whose body
 * says `partial`. Reporting that as a success would hide exactly the thing this
 * screen exists to show, so the summary below reads the job's own status rather
 * than the HTTP one.
 */
export function SyncCatalogButton({ channelId, disabled }: { channelId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<SyncJobItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setJob(null);

    const response = await fetch(`/api/channels/${channelId}/sync/catalog`, { method: 'POST' });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // 4xx only: no job was started, and the body says why.
      setError(body?.error?.message ?? 'The sync could not be started');
    } else {
      setJob(body as SyncJobItem);
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
        className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {busy ? 'Pushing…' : 'Sync catalog'}
      </button>

      {job && (
        <p className={`text-xs ${tone}`}>
          {job.status} — {job.itemsOk} accepted, {job.itemsFailed} rejected.{' '}
          <Link href="/sync-log" className="underline underline-offset-2">
            Open the log
          </Link>
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
