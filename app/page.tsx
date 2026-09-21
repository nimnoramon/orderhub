import Link from 'next/link';
import { demoLogin } from '@/server/demo';
import { serverMessages } from '@/server/i18n/locale';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';

export default async function Home() {
  // The root layout reads the language cookie, so this page renders per request
  // rather than at build time — which also means changing DEMO_EMAIL or
  // DEMO_PASSWORD in Vercel now shows up on the card below without a redeploy.
  const login = demoLogin();
  const t = await serverMessages();

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">OrderHub</h1>
        <LocaleSwitch />
      </div>
      <p className="mt-3 text-neutral-600">{t.landing.intro}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/overview"
          className="inline-flex rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          {t.landing.openDashboard}
        </Link>
        <Link
          href="/orders"
          className="inline-flex rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t.landing.orders}
        </Link>
        <Link
          href="/products"
          className="inline-flex rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t.landing.products}
        </Link>
      </div>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
        <p className="font-medium text-neutral-900">{t.landing.demoLogin}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-neutral-600">
          <dt className="text-neutral-400">{t.landing.email}</dt>
          <dd className="font-mono text-xs">{login.email}</dd>
          <dt className="text-neutral-400">{t.landing.password}</dt>
          <dd className="font-mono text-xs">{login.password}</dd>
        </dl>
        {/* Printed, and also prefilled on the form itself. The account is real
            — bcrypt hash, signed session cookie, throttled attempts — it is the
            data behind it that is fictional. */}
        <p className="mt-2 text-xs text-neutral-500">{t.landing.demoNote}</p>
      </div>

      {/* Every milestone listed is finished, so the number is the array index
          and the copy is the only thing that changes per language. An unfinished
          one would need its flag back — and the honesty that goes with it. */}
      <ol className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
        {t.landing.milestones.map((title, index) => (
          <li key={title} className="flex items-center gap-4 py-3 text-sm">
            <span className="w-4 tabular-nums text-neutral-400">{index + 1}</span>
            <span className="text-neutral-900">{title}</span>
            <span className="ml-auto text-xs text-teal-700">{t.landing.done}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
