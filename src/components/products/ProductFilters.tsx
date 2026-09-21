'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ProductStatus } from '@/generated/prisma/enums';
import { useT } from '@/components/ui/I18nProvider';

/**
 * Filters live in the URL, not in component state: the server component reads
 * them, so a filtered view survives a reload and can be pasted to someone else.
 * This component's only job is to write them.
 */
export function ProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const [pending, startTransition] = useTransition();

  const activeQuery = searchParams.get('query') ?? '';
  const status = searchParams.get('status') ?? '';
  const [query, setQuery] = useState(activeQuery);
  const [syncedQuery, setSyncedQuery] = useState(activeQuery);

  // Keep the box in step when the URL changes from somewhere else — the back
  // button, or the Clear link — without fighting the user while they type.
  // Adjusted during render rather than in an effect: React re-runs this
  // component before touching the DOM, so the input never shows the stale value
  // and the cursor stays where it was.
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative">
        <span className="sr-only">{t.products.filters.searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.products.filters.searchPlaceholder}
          className="w-64 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-teal-600 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-500">
        {t.common.status}
        <select
          value={status}
          onChange={(event) => setParam('status', event.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-teal-600 focus:outline-none"
        >
          <option value="">{t.common.all}</option>
          {Object.values(ProductStatus).map((value) => (
            <option key={value} value={value}>
              {t.productStatus[value]}
            </option>
          ))}
        </select>
      </label>

      {(activeQuery || status) && (
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
