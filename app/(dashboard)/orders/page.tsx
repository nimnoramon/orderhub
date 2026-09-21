import { orderListQuery } from '@/lib/schemas/orders';
import { cleanParams } from '@/lib/schemas/query';
import { requireSignedIn } from '@/server/auth/session';
import { serverMessages } from '@/server/i18n/locale';
import { listOrders } from '@/server/services/orders';
import { OrderFilters } from '@/components/orders/OrderFilters';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { Pagination } from '@/components/ui/Pagination';

// Orders move while the page is open, and the full route cache would serve a
// transition-old copy of the list.
export const dynamic = 'force-dynamic';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { merchantId } = await requireSignedIn();
  const t = await serverMessages();
  const params = cleanParams(await searchParams);

  // A hand-edited URL degrades to the default view rather than an error page.
  // The API route parses the same schema and does return 422 — there the caller
  // is a program and the mistake is worth reporting.
  const parsed = orderListQuery.safeParse(params);
  const query = parsed.success ? parsed.data : orderListQuery.parse({});

  const { data, page, channels } = await listOrders(merchantId, query);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{t.orders.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.orders.subtitle(page.total)}</p>
      </header>

      <OrderFilters channels={channels} />
      <OrdersTable orders={data} />
      <Pagination page={page} params={params} basePath="/orders" />
    </div>
  );
}
