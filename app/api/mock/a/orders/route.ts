import { authorize, fail, orderListQuery, ordersPage } from '@/mock/a';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mock/a/orders?cursor=cur_a_00042&limit=25
 *
 * Cursor pagination, not page numbers: the caller is handed an opaque string and
 * asks for what comes after it. `next_cursor` is null once the feed is caught
 * up, which is how the puller knows to stop — and, from milestone 5, the value
 * that is only written back to `Channel.cursor` after the page it points past
 * has been committed.
 */
export function GET(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const parsed = orderListQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return fail(400, 'INVALID_QUERY', 'limit must be between 1 and 100.');

  const { cursor, limit } = parsed.data;
  return Response.json(ordersPage(cursor, limit));
}
