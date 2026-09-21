import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireSignedIn } from '@/server/auth/session';
import { serverMessages } from '@/server/i18n/locale';
import { DemoNotice } from '@/components/ui/DemoNotice';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { SideNav } from '@/components/ui/SideNav';
import { SignOutButton } from '@/components/auth/SignOutButton';

/**
 * Every page under this layout also resolves the session for itself, because a
 * layout is not a gate: Next renders it alongside its page rather than in front
 * of it, so a guard that lived only here would be a redirect racing a render.
 * The duplication is the point — the pages are safe on their own, and this is
 * what draws the chip.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireSignedIn();
  const t = await serverMessages();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 md:flex-row md:py-10">
      <aside className="flex flex-col md:w-56 md:shrink-0">
        <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
          OrderHub
        </Link>
        <p className="mt-0.5 mb-3 text-xs text-neutral-400">{t.shell.tagline}</p>
        <LocaleSwitch className="mb-4 self-start" />
        <SideNav />

        <div className="mt-5 border-t border-neutral-200 pt-3 md:mt-auto">
          <p className="text-xs font-medium text-neutral-700">{user.name}</p>
          <p className="truncate text-xs text-neutral-400" title={user.email}>
            {user.email}
          </p>
          <div className="mt-1">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-5">
        <DemoNotice />
        {children}
      </main>
    </div>
  );
}
