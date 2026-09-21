import { SyncJobStatus, type ChannelKind, type SyncJobType } from '@/generated/prisma/enums';
import { prisma } from '@/server/db';
import { AppError } from '@/server/http/errors';
import type { SyncFailure, SyncJobItem } from '@/lib/types';

/**
 * The thing that turns "we called a channel" into a row somebody can read later.
 *
 * Every sync goes through here, so there is exactly one place that decides what
 * a run's outcome was, and exactly one place that guarantees a job row is closed
 * even when the body throws. A `running` job with no `finishedAt` is the failure
 * mode that makes a sync log worthless, and the only way to avoid it is to make
 * finishing someone else's job rather than each caller's.
 *
 * The run happens inside the request. There is no worker in this demo and
 * pretending otherwise would be a lie told in code rather than in the README —
 * the `queued` status exists for the day there is one, and milestone 6's retry
 * queue is where the asynchronous half actually lands.
 */

/** A whole-run failure has no item to point at. */
const RUN_LEVEL_REF = '—';

/** How long a `running` job is believed before it is treated as abandoned. */
const STALE_RUNNING_MS = 5 * 60_000;

export type JobOutcome = { itemsOk: number; failures: SyncFailure[] };

export const jobSelect = {
  id: true,
  type: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  attempt: true,
  itemsOk: true,
  itemsFailed: true,
  errorSummary: true,
  createdAt: true,
  channel: { select: { id: true, name: true, kind: true } },
} as const;

type JobRow = {
  id: string;
  type: SyncJobType;
  status: SyncJobStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempt: number;
  itemsOk: number;
  itemsFailed: number;
  errorSummary: unknown;
  createdAt: Date;
  channel: { id: string; name: string; kind: ChannelKind };
};

/** `errorSummary` is jsonb, so what comes back is whatever was once written. */
function toFailures(value: unknown): SyncFailure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { ref, code, message } = entry as Record<string, unknown>;
    return [
      {
        ref: typeof ref === 'string' ? ref : RUN_LEVEL_REF,
        code: typeof code === 'string' ? code : 'UNKNOWN',
        message: typeof message === 'string' ? message : '',
      },
    ];
  });
}

export const mapSyncJob = (row: JobRow): SyncJobItem => ({
  id: row.id,
  channel: row.channel,
  type: row.type,
  status: row.status,
  startedAt: row.startedAt?.toISOString() ?? null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
  durationMs:
    row.startedAt && row.finishedAt ? row.finishedAt.getTime() - row.startedAt.getTime() : null,
  attempt: row.attempt,
  itemsOk: row.itemsOk,
  itemsFailed: row.itemsFailed,
  failures: toFailures(row.errorSummary),
  createdAt: row.createdAt.toISOString(),
});

/**
 * The outcome rule, written once and testable without a database.
 *
 * `partial` is the whole point of this project's sync model: a batch API fails
 * per item, so a run where 47 listings landed and 3 were rejected did not fail —
 * calling it `failed` would throw away the 47 and invite a retry that pushes
 * them again. It is also not `succeeded`, because three listings are missing and
 * somebody has to see them.
 *
 * Nothing succeeding is a different story. A run where every item was rejected
 * has nothing to be partial about, and `failed` is what it is.
 */
export function statusForCounts(itemsOk: number, itemsFailed: number): SyncJobStatus {
  if (itemsFailed === 0) return SyncJobStatus.succeeded;
  if (itemsOk === 0) return SyncJobStatus.failed;
  return SyncJobStatus.partial;
}

/**
 * Two clicks on "Sync catalog" should not push the catalog twice. The guard is
 * advisory rather than a lock — a row that has been `running` for longer than a
 * function can live is treated as abandoned, because a serverless invocation
 * that was killed mid-run would otherwise block the channel forever.
 */
async function assertNotAlreadyRunning(channelId: string, type: SyncJobType): Promise<void> {
  const running = await prisma.syncJob.findFirst({
    where: {
      channelId,
      type,
      status: SyncJobStatus.running,
      startedAt: { gte: new Date(Date.now() - STALE_RUNNING_MS) },
    },
    select: { id: true, startedAt: true },
  });

  if (running) {
    throw new AppError('CONFLICT', 'A sync of this kind is already running on this channel.', {
      jobId: running.id,
      startedAt: running.startedAt?.toISOString() ?? null,
    });
  }
}

/**
 * `attempt` is 1 for a run somebody asked for and higher for one the retry queue
 * asked for, which is the number the sync log prints beside a job. It is the
 * column that has been sitting in the schema since milestone 1 waiting for a
 * queue to give it a meaning.
 */
export async function runJob(
  channelId: string,
  type: SyncJobType,
  body: () => Promise<JobOutcome>,
  options: { attempt?: number } = {},
): Promise<SyncJobItem> {
  await assertNotAlreadyRunning(channelId, type);

  const job = await prisma.syncJob.create({
    data: {
      channelId,
      type,
      status: SyncJobStatus.running,
      startedAt: new Date(),
      attempt: options.attempt ?? 1,
    },
    select: { id: true },
  });

  let outcome: JobOutcome;
  try {
    outcome = await body();
  } catch (error) {
    // The run is over, and the row has to say so. A failure to reach the channel
    // at all is recorded as one run-level entry rather than being invented as a
    // per-item result, because no item was ever answered for.
    if (!(error instanceof AppError)) console.error('[sync]', error);
    outcome = {
      itemsOk: 0,
      failures: [
        error instanceof AppError
          ? { ref: RUN_LEVEL_REF, code: error.code, message: error.message }
          : { ref: RUN_LEVEL_REF, code: 'INTERNAL', message: 'Unexpected error — see the server log' },
      ],
    };
  }

  const finished = await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: statusForCounts(outcome.itemsOk, outcome.failures.length),
      itemsOk: outcome.itemsOk,
      itemsFailed: outcome.failures.length,
      errorSummary: outcome.failures.length > 0 ? outcome.failures : undefined,
      finishedAt: new Date(),
    },
    select: jobSelect,
  });

  return mapSyncJob(finished);
}
