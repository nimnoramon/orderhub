import Link from 'next/link';
import { demoLogin } from '@/server/demo';

const MILESTONES = [
  { n: 1, title: 'Scaffold, schema, seed', done: true },
  { n: 2, title: 'Products and the stock ledger', done: true },
  { n: 3, title: 'Orders and the state machine', done: true },
  { n: 4, title: 'MockShop A and the adapter interface', done: true },
  { n: 5, title: 'MockShop B and idempotent order pull', done: true },
  { n: 6, title: 'Rate limiting, retry queue, cached dashboard', done: true },
  { n: 7, title: 'Overview dashboard and README', done: true },
  { n: 8, title: 'Sign-in, signed session cookie', done: true },
];

export default function Home() {
  // Read at build time: this page is static, so changing DEMO_EMAIL or
  // DEMO_PASSWORD in Vercel needs a redeploy before the card below catches up.
  const login = demoLogin();

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">OrderHub</h1>
      <p className="mt-3 text-neutral-600">
        A miniature omnichannel order hub — product/stock/order core, two mock marketplace
        connectors, and an admin dashboard. Built in the open, one milestone at a time.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/overview"
          className="inline-flex rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          Open the dashboard
        </Link>
        <Link
          href="/orders"
          className="inline-flex rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Orders
        </Link>
        <Link
          href="/products"
          className="inline-flex rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Products &amp; stock
        </Link>
      </div>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
        <p className="font-medium text-neutral-900">Demo login</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-neutral-600">
          <dt className="text-neutral-400">email</dt>
          <dd className="font-mono text-xs">{login.email}</dd>
          <dt className="text-neutral-400">password</dt>
          <dd className="font-mono text-xs">{login.password}</dd>
        </dl>
        {/* Printed, and also prefilled on the form itself. The account is real
            — bcrypt hash, signed session cookie, throttled attempts — it is the
            data behind it that is fictional. */}
        <p className="mt-2 text-xs text-neutral-500">
          The sign-in form comes with these already typed in, so the way into a portfolio demo is
          not a puzzle. They are safe to print because the merchant, the products and the orders
          are invented; the login itself works like any other.
        </p>
      </div>

      <ol className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
        {MILESTONES.map((m) => (
          <li key={m.n} className="flex items-center gap-4 py-3 text-sm">
            <span className="w-4 tabular-nums text-neutral-400">{m.n}</span>
            <span className={m.done ? 'text-neutral-900' : 'text-neutral-500'}>{m.title}</span>
            {m.done && <span className="ml-auto text-xs text-teal-700">done</span>}
          </li>
        ))}
      </ol>
    </main>
  );
}
