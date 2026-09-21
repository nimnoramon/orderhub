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
/**
 * Resolved per request, never memoised across them.
 *
 * It was cached in a module-level variable until a reseed proved why that is
 * the wrong shape. `db:seed:prod` mints a new merchant id, and every warm
 * instance carried on filtering by the old one — so every screen answered 200
 * with an empty list, and nothing threw, because a process holding a stale id
 * never asks whether it is still real. A demo whose README tells you to reseed
 * cannot hold identity across deployments of its own data.
 *
 * The deeper reason is the one that outlives this milestone: this is the seam
 * that becomes a signed-cookie read, and *who is asking* is the last thing a
 * server should remember between requests. One indexed `findFirst` is a price
 * worth paying to keep it that way.
 */
export async function requireMerchantId(): Promise<string> {
  const merchant = await prisma.merchant.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!merchant) throw new AppError('UNAUTHORIZED', 'No merchant found — run `pnpm db:seed`');

  return merchant.id;
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
