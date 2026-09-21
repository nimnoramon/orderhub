import Link from 'next/link';
import { formatCentsRange } from '@/lib/money';
import { serverMessages } from '@/server/i18n/locale';
import { LowStockPill, StatusPill } from '@/components/ui/StatusPill';
import type { ProductListItem } from '@/lib/types';

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2.5 text-sm text-neutral-700';

export async function ProductsTable({ products }: { products: ProductListItem[] }) {
  const t = await serverMessages();

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
        {t.products.empty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-neutral-200 bg-neutral-50/60">
          <tr>
            <th className={TH}>{t.products.table.sku}</th>
            <th className={TH}>{t.products.table.name}</th>
            <th className={TH}>{t.products.table.status}</th>
            <th className={`${TH} text-right`}>{t.products.table.variants}</th>
            <th className={`${TH} text-right`}>{t.products.table.price}</th>
            <th className={`${TH} text-right`}>{t.products.table.onHand}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {products.map((product) => (
            <tr key={product.id} className="relative hover:bg-neutral-50">
              <td className={`${TD} font-mono text-xs text-neutral-500`}>{product.sku}</td>
              <td className={`${TD} font-medium text-neutral-900`}>
                {/* Stretched link: the whole row is the click target, without
                    nesting interactive elements inside one another. */}
                <Link href={`/products/${product.id}`} className="after:absolute after:inset-0">
                  {product.name}
                </Link>
              </td>
              <td className={TD}>
                <StatusPill status={product.status} />
              </td>
              <td className={`${TD} text-right tabular-nums text-neutral-500`}>
                {product.variantCount}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatCentsRange(product.priceRangeCents, product.currency)}
              </td>
              <td className={`${TD} text-right`}>
                <span className="inline-flex items-center gap-2">
                  {product.lowStock && <LowStockPill />}
                  <span className="tabular-nums">{product.onHand}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
