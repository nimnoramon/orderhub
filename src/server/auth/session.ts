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

/**
 * Who to record as the actor on anything this request writes. Channel-driven
 * writes pass their own label (`channel:mock_a`); everything a human clicks in
 * the dashboard is the demo login, until real auth replaces this with the email
 * on the session cookie.
 */
export const DEMO_ACTOR = 'demo@orderhub.dev';

export async function currentActor(): Promise<string> {
  return DEMO_ACTOR;
}
