'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { OrderStatus } from '@/generated/prisma/enums';
import { useT } from '@/components/ui/I18nProvider';
import type { ChannelRef } from '@/lib/types';

/**
 * Same contract as the product filters: the URL holds the state, this component
 * only writes it. A filtered list survives a reload and can be pasted to
 * someone else, and the server component does the reading.
 */
export function OrderFilters({ channels }: { channels: ChannelRef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const [pending, startTransition] = useTransition();

  const activeQuery = searchParams.get('query') ?? '';
  const status = searchParams.get('status') ?? '';
  const channelId = searchParams.get('channelId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const [query, setQuery] = useState(activeQuery);
  const [syncedQuery, setSyncedQuery] = useState(activeQuery);

  // Keep the box in step when the URL changes from somewhere else — the back
  // button, or the Clear link — without fighting the user while they type.
  if (activeQuery !== syncedQuery) {
    setSyncedQuery(activeQuery);
    setQuery(activeQuery);
  }

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

  useEffect(() => {
    if (query === activeQuery) return;
    const timer = setTimeout(() => setParam('query', query), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const select =
    'rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-teal-600 focus:outline-none';
  const anyActive = Boolean(activeQuery || status || channelId || from || to);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative">
        <span className="sr-only">{t.orders.filters.searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.orders.filters.searchPlaceholder}
          className="w-60 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-teal-600 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-500">
        {t.common.status}
        <select value={status} onChange={(e) => setParam('status', e.target.value)} className={select}>
          <option value="">{t.common.all}</option>
          {Object.values(OrderStatus).map((value) => (
            <option key={value} value={value}>
              {t.orderStatus[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-500">
        {t.common.channel}
        <select
          value={channelId}
          onChange={(e) => setParam('channelId', e.target.value)}
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
        {t.orders.filters.placed}
        {/* Both ends are inclusive whole days in UTC — see src/lib/dates.ts. */}
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setParam('from', e.target.value)}
          className={select}
        />
        <span className="text-neutral-400">→</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setParam('to', e.target.value)}
          className={select}
        />
      </label>

      {anyActive && (
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
