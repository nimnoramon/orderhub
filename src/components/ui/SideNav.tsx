'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The five screens of section 5 of the brief, in the order somebody works
 * through them: what happened, what to do about it, what we sell, who we sell
 * it through, and what the machines did overnight.
 *
 * Every row is a link now. Until milestone 7 the Overview was a disabled row
 * rather than a link to an empty page — the nav said what the app was without
 * pretending the rest of it was built.
 */
const ITEMS = [
  { label: 'Overview', href: '/overview' },
  { label: 'Orders', href: '/orders' },
  { label: 'Products & stock', href: '/products' },
  { label: 'Channels', href: '/channels' },
  { label: 'Sync log', href: '/sync-log' },
] as const;

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
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
