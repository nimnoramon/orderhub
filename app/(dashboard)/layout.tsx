import Link from 'next/link';
import type { ReactNode } from 'react';
import { SideNav } from '@/components/ui/SideNav';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 md:flex-row md:py-10">
      <aside className="md:w-56 md:shrink-0">
        <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
          OrderHub
        </Link>
        <p className="mt-0.5 mb-5 text-xs text-neutral-400">Northwind Supply Co. · demo data</p>
        <SideNav />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
