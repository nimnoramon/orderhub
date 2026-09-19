import { requireMerchantId } from '@/server/auth/session';
import { json, readJson, route } from '@/server/http/handler';
import { createProduct as createProductSchema, productListQuery } from '@/lib/schemas/products';
import { cleanParams } from '@/lib/schemas/query';
import { createProduct, listProducts } from '@/server/services/products';

// Every route here reads the database on request. Without this, `next build`
// treats a GET handler with no dynamic API in it as prerenderable and runs it
// at build time — against a database that the build has no business needing.
export const dynamic = 'force-dynamic';

// Parse, authenticate, call a service, return data. No Prisma above this line
// and no NextResponse below it.
export const GET = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const query = productListQuery.parse(cleanParams(new URL(request.url).searchParams));
  return json(await listProducts(merchantId, query));
});

export const POST = route(async (request: Request) => {
  const merchantId = await requireMerchantId();
  const input = createProductSchema.parse(await readJson(request));
  return json(await createProduct(merchantId, input), 201);
});
