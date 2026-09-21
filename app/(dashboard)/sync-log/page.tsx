import { cleanParams } from '@/lib/schemas/query';
import { syncJobListQuery } from '@/lib/schemas/sync';
import { requireSignedIn } from '@/server/auth/session';
import { serverMessages } from '@/server/i18n/locale';
import { listSyncJobs } from '@/server/services/sync';
import { SyncJobFilters } from '@/components/sync/SyncJobFilters';
import { SyncJobsTable } from '@/components/sync/SyncJobsTable';
import { Pagination } from '@/components/ui/Pagination';

// A sync started from the Channels screen must be visible here the moment it
// finishes, so this page is never served from the route cache.
export const dynamic = 'force-dynamic';

export default async function SyncLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { merchantId } = await requireSignedIn();
  const t = await serverMessages();
  const params = cleanParams(await searchParams);

  // A hand-edited URL degrades to the default view rather than an error page.
  // The API route parses the same schema and does return 422 — there the caller
  // is a program and the mistake is worth reporting.
  const parsed = syncJobListQuery.safeParse(params);
  const query = parsed.success ? parsed.data : syncJobListQuery.parse({});

  const { data, page, channels } = await listSyncJobs(merchantId, query);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{t.syncLog.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t.syncLog.subtitleLead}{' '}
          <span className="font-medium text-amber-700">{t.syncStatus.partial}</span>{' '}
          {t.syncLog.subtitleTail}
        </p>
      </header>

      <SyncJobFilters channels={channels} />
      <SyncJobsTable jobs={data} />
      <Pagination page={page} params={params} basePath="/sync-log" />
    </div>
  );
}
