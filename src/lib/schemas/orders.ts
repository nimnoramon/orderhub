import { z } from 'zod';
import { OrderStatus } from '@/generated/prisma/enums';
import { PAGE_SIZE } from '@/lib/schemas/query';

/** `YYYY-MM-DD`, the format a native date input submits. */
const day = z.iso.date();

export const orderListQuery = z
  .object({
    query: z.string().max(100).optional(),
    status: z.enum(OrderStatus).optional(),
    channelId: z.string().optional(),
    from: day.optional(),
    to: day.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  })
  .refine((input) => !input.from || !input.to || input.from <= input.to, {
    // ISO dates sort lexically, so this needs no parsing to be correct.
    path: ['to'],
    message: 'the end of the range must not precede its start',
  });
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const orderTransition = z.object({
  to: z.enum(OrderStatus),
  note: z.string().trim().max(200).optional(),
});
export type OrderTransitionInput = z.infer<typeof orderTransition>;
