import { z } from 'zod';
import { SyncJobStatus, SyncJobType } from '@/generated/prisma/enums';
import { PAGE_SIZE } from '@/lib/schemas/query';

/**
 * The sync log's filters. The mock marketplaces validate their own requests with
 * their own schemas, in `src/mock` — they are a third party, and their contract
 * is not ours to keep here.
 */
export const syncJobListQuery = z.object({
  channelId: z.string().optional(),
  status: z.enum(SyncJobStatus).optional(),
  type: z.enum(SyncJobType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
});
export type SyncJobListQuery = z.infer<typeof syncJobListQuery>;
