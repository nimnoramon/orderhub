import { z } from 'zod';
import { ProductStatus } from '@/generated/prisma/enums';
import { PAGE_SIZE } from '@/lib/schemas/query';

export const productListQuery = z.object({
  query: z.string().max(100).optional(),
  status: z.enum(ProductStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
});
export type ProductListQuery = z.infer<typeof productListQuery>;

export const variantInput = z.object({
  sku: z.string().trim().min(1).max(64),
  priceCents: z.number().int().min(0),
  attributes: z.record(z.string(), z.string()).default({}),
  currency: z.string().length(3).default('USD'),
});

export const createProduct = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  status: z.enum(ProductStatus).default('draft'),
  variants: z.array(variantInput).min(1, 'a product needs at least one variant'),
});
export type CreateProductInput = z.infer<typeof createProduct>;
