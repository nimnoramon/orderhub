import type { ProductStatus } from '@/generated/prisma/enums';

const STYLES: Record<ProductStatus, string> = {
  active: 'bg-teal-50 text-teal-800 ring-teal-600/20',
  draft: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  archived: 'bg-neutral-100 text-neutral-400 ring-neutral-400/20',
};

export function StatusPill({ status }: { status: ProductStatus }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function LowStockPill() {
  return (
    <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
      low
    </span>
  );
}
