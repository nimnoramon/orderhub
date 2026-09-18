import { prisma } from '@/server/db';
import { AppError } from '@/server/http/errors';

/**
 * The authentication seam.
 *
 * Real auth is one seeded demo login and arrives with its own milestone; until
 * then this resolves the single seeded merchant. Every service takes a
 * merchantId as its first argument regardless, so swapping this body for a
 * signed-cookie read changes exactly one file — no route or service moves.
 */
let cached: string | undefined;

export async function requireMerchantId(): Promise<string> {
  if (cached) return cached;

  const merchant = await prisma.merchant.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!merchant) throw new AppError('UNAUTHORIZED', 'No merchant found — run `pnpm db:seed`');

  cached = merchant.id;
  return cached;
}
