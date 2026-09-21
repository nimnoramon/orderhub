'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { SyncJobStatus, SyncJobType } from '@/generated/prisma/enums';
import { useT } from '@/components/ui/I18nProvider';
import type { ChannelRef } from '@/lib/types';

/**
 * Same contract as the orders and products filters: the URL holds the state and
 * this component only writes it, so a link to "everything that ended partial on
 * MockShop A" is a link somebody can send.
 */
export function SyncJobFilters({ channels }: { channels: ChannelRef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const [pending, startTransition] = useTransition();

  const channelId = searchParams.get('channelId') ?? '';
  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';

  const push = (next: URLSearchParams) => {
    next.delete('page'); // a new filter always starts at page one
    startTransition(() => router.push(next.size ? `${pathname}?${next}` : pathname));
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };

  const select =
    'rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-teal-600 focus:outline-none';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-neutral-500">
        {t.common.channel}
        <select
          value={channelId}
          onChange={(event) => setParam('channelId', event.target.value)}
          className={select}
        >
          <option value="">{t.common.all}</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-500">
        {t.common.status}
        <select
          value={status}
          onChange={(event) => setParam('status', event.target.value)}
          className={select}
        >
          <option value="">{t.common.all}</option>
          {Object.values(SyncJobStatus).map((value) => (
            <option key={value} value={value}>
              {t.syncStatus[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-500">
        {t.syncLog.job}
        <select
          value={type}
          onChange={(event) => setParam('type', event.target.value)}
          className={select}
        >
          <option value="">{t.common.all}</option>
          {Object.values(SyncJobType).map((value) => (
            <option key={value} value={value}>
              {t.jobType[value]}
            </option>
          ))}
        </select>
      </label>

      {(channelId || status || type) && (
        <button
          type="button"
          onClick={() => push(new URLSearchParams())}
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          {t.common.clear}
        </button>
      )}

      <span
        aria-live="polite"
        className={`text-xs text-neutral-400 ${pending ? 'opacity-100' : 'opacity-0'}`}
      >
        {t.common.filtering}
      </span>
    </div>
  );
}
