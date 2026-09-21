import { DEFAULT_CURRENCY } from '@/lib/money';
import { isUniqueViolation, prisma } from '@/server/db';
import { AppError, notFound } from '@/server/http/errors';
import { deriveLevels } from '@/server/stock/levels';
import { listMovements, listWarehouses, summariseLevels } from '@/server/services/stock';
import type { CreateProductInput, ProductListQuery } from '@/lib/schemas/products';
import type {
  Paginated,
  ProductDetail,
  ProductListItem,
  VariantWithLevels,
} from '@/lib/types';

const priceRange = (variants: { priceCents: number }[]): [number, number] | null => {
  if (variants.length === 0) return null;
  const prices = variants.map((v) => v.priceCents);
  return [Math.min(...prices), Math.max(...prices)];
};

export async function listProducts(
  merchantId: string,
  input: ProductListQuery,
): Promise<Paginated<ProductListItem>> {
  const where = {
    merchantId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.query
      ? {
          OR: [
            { sku: { contains: input.query, mode: 'insensitive' as const } },
            { name: { contains: input.query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, products, warehouses] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { sku: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        sku: true,
        name: true,
        status: true,
        updatedAt: true,
        variants: { select: { id: true, priceCents: true, currency: true } },
      },
    }),
    listWarehouses(merchantId),
  ]);

  const levelByVariant = await summariseLevels(
    merchantId,
    products.flatMap((p) => p.variants.map((v) => v.id)),
    warehouses,
  );

  const data: ProductListItem[] = products.map((product) => {
    const levels = product.variants.map((v) => levelByVariant.get(v.id)!);
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      status: product.status,
      variantCount: product.variants.length,
      priceRangeCents: priceRange(product.variants),
      currency: product.variants[0]?.currency ?? DEFAULT_CURRENCY,
      onHand: levels.reduce((total, level) => total + level.onHand, 0),
      lowStock: levels.some((level) => level.lowStock),
      updatedAt: product.updatedAt.toISOString(),
    };
  });

  return {
    data,
    page: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getProduct(merchantId: string, id: string): Promise<ProductDetail> {
  const product = await prisma.product.findFirst({
    where: { id, merchantId },
    select: {
      id: true,
      sku: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      variants: {
        orderBy: { sku: 'asc' },
        select: { id: true, sku: true, attributes: true, priceCents: true, currency: true },
      },
    },
  });
  if (!product) throw notFound('Product');

  const variantIds = product.variants.map((v) => v.id);
  const [warehouses, deltas, recentMovements] = await Promise.all([
    listWarehouses(merchantId),
    // One product's ledger is a bounded set, so the detail screen derives its
    // levels from the raw movements rather than a pre-summed query — the same
    // function, fed the rows it was written for.
    prisma.stockMovement.findMany({
      where: { variantId: { in: variantIds }, warehouse: { merchantId } },
      select: { variantId: true, warehouseId: true, delta: true },
    }),
    listMovements(merchantId, { variantIds, limit: 20 }),
  ]);

  const levels = deriveLevels(
    deltas,
    variantIds,
    warehouses.map((w) => w.id),
  );
  const levelByVariant = new Map(levels.map((level) => [level.variantId, level]));

  const variants: VariantWithLevels[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    attributes: (variant.attributes ?? {}) as Record<string, string>,
    priceCents: variant.priceCents,
    currency: variant.currency,
    levels: levelByVariant.get(variant.id)!,
  }));

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    warehouses,
    variants,
    onHand: variants.reduce((total, variant) => total + variant.levels.onHand, 0),
    recentMovements,
  };
}

export async function createProduct(
  merchantId: string,
  input: CreateProductInput,
): Promise<ProductDetail> {
  try {
    const created = await prisma.product.create({
      data: {
        merchantId,
        sku: input.sku,
        name: input.name,
        status: input.status,
        variants: {
          create: input.variants.map((variant) => ({
            sku: variant.sku,
            priceCents: variant.priceCents,
            currency: variant.currency,
            attributes: variant.attributes,
          })),
        },
      },
      select: { id: true },
    });
    return getProduct(merchantId, created.id);
  } catch (error) {
    // The database owns uniqueness. Checking for the SKU first and then
    // inserting would let two concurrent requests both pass the check.
    if (isUniqueViolation(error)) {
      throw new AppError('SKU_TAKEN', `SKU ${input.sku} is already in use`);
    }
    throw error;
  }
}
