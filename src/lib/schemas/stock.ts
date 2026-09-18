import { z } from 'zod';
import { StockReason } from '@/generated/prisma/enums';
import { PAGE_SIZE } from '@/lib/schemas/products';

/**
 * The reasons a human may pick in the adjust dialog. `sale` belongs to the
 * order path and `sync` to the channel path — letting someone hand-write one
 * would make the ledger lie about where the movement came from.
 */
export const MANUAL_REASONS = [
  StockReason.adjustment,
  StockReason.purchase,
  StockReason.return,
] as const;

export const stockLevelsQuery = z.object({
  warehouseId: z.string().optional(),
  query: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
});
export type StockLevelsQuery = z.infer<typeof stockLevelsQuery>;

export const createMovement = z.object({
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  // A zero-delta row would be an audit entry that changed nothing.
  delta: z.coerce.number().int().refine((d) => d !== 0, { message: 'delta must not be zero' }),
  reason: z.enum(MANUAL_REASONS),
  note: z.string().trim().max(200).optional(),
});
export type CreateMovementInput = z.infer<typeof createMovement>;
