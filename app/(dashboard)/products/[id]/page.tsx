import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/dates';
import { requireSignedIn } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { getProduct } from '@/server/services/products';
import { MovementsTable } from '@/components/stock/MovementsTable';
import { StockGrid } from '@/components/stock/StockGrid';
import { StatusPill } from '@/components/ui/StatusPill';

export const dynamic = 'force-dynamic';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { merchantId } = await requireSignedIn();
  const { id } = await params;

  const product = await getProduct(merchantId, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const lowWarehouses = product.variants.reduce(
    (count, variant) => count + variant.levels.byWarehouse.filter((cell) => cell.lowStock).length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/products" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Products
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{product.name}</h1>
          <StatusPill status={product.status} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          <span className="font-mono text-xs">{product.sku}</span> · created{' '}
          {formatDate(product.createdAt)} · updated {formatDate(product.updatedAt)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="On hand" value={product.onHand} />
        <Stat label="Variants" value={product.variants.length} />
        <Stat label="Low warehouses" value={lowWarehouses} />
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Stock by warehouse</h2>
        <StockGrid variants={product.variants} warehouses={product.warehouses} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Recent movements</h2>
        <MovementsTable movements={product.recentMovements} />
      </section>
    </div>
  );
}
