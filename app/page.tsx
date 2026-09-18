const MILESTONES = [
  { n: 1, title: "Scaffold, schema, seed", done: true },
  { n: 2, title: "Products and the stock ledger", done: false },
  { n: 3, title: "Orders and the state machine", done: false },
  { n: 4, title: "MockShop A and the adapter interface", done: false },
  { n: 5, title: "MockShop B and idempotent order pull", done: false },
  { n: 6, title: "Rate limiting, retry queue, cached dashboard", done: false },
  { n: 7, title: "Overview dashboard and README", done: false },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">OrderHub</h1>
      <p className="mt-3 text-neutral-600">
        A miniature omnichannel order hub — product/stock/order core, two mock marketplace
        connectors, and an admin dashboard. Being built in the open, one milestone at a time.
      </p>

      <ol className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
        {MILESTONES.map((m) => (
          <li key={m.n} className="flex items-center gap-4 py-3 text-sm">
            <span className="w-4 tabular-nums text-neutral-400">{m.n}</span>
            <span className={m.done ? "text-neutral-900" : "text-neutral-500"}>{m.title}</span>
            {m.done && <span className="ml-auto text-xs text-teal-700">done</span>}
          </li>
        ))}
      </ol>
    </main>
  );
}
