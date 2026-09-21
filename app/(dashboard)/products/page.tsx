import { productListQuery } from '@/lib/schemas/products';
import { cleanParams } from '@/lib/schemas/query';
import { requireSignedIn } from '@/server/auth/session';
import { serverMessages } from '@/server/i18n/locale';
import { listProducts } from '@/server/services/products';
import { ProductFilters } from '@/components/products/ProductFilters';
import { ProductsTable } from '@/components/products/ProductsTable';
import { Pagination } from '@/components/ui/Pagination';

// Stock levels change under the page, and the full route cache would happily
// serve an adjustment-old copy of it.
export const dynamic = 'force-dynamic';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { merchantId } = await requireSignedIn();
  const t = await serverMessages();
  const params = cleanParams(await searchParams);

  // A hand-edited URL should degrade to the default view, not to an error page.
  // The API route parses the same schema and does return 422 — there the caller
  // is a program and the mistake is worth reporting.
  const parsed = productListQuery.safeParse(params);
  const query = parsed.success ? parsed.data : productListQuery.parse({});

  const { data, page } = await listProducts(merchantId, query);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{t.products.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.products.subtitle(page.total)}</p>
      </header>

      <ProductFilters />
      <ProductsTable products={data} />
      <Pagination page={page} params={params} basePath="/products" />
    </div>
  );
}
