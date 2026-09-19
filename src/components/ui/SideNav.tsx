'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sections that do not exist yet are rendered as disabled rows rather than as
 * links to empty pages: the nav says what the app is, without pretending the
 * rest of it is built.
 */
const ITEMS = [
  { label: 'Overview', href: null, milestone: 7 },
  { label: 'Orders', href: '/orders', milestone: null },
  { label: 'Products & stock', href: '/products', milestone: null },
  { label: 'Channels', href: null, milestone: 4 },
  { label: 'Sync log', href: null, milestone: 4 },
] as const;

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        if (!item.href) {
          return (
            <span
              key={item.label}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-400"
              title={`Arrives in milestone ${item.milestone}`}
            >
              {item.label}
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-400">
                M{item.milestone}
              </span>
            </span>
          );
        }

        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'shrink-0 rounded-md bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800'
                : 'shrink-0 rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
