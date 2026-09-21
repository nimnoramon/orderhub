import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/server/db';
import { AppError } from '@/server/http/errors';
import { SESSION_COOKIE, readSession } from '@/server/auth/cookie';
import type { SessionUser } from '@/lib/types';

/**
 * Who is asking.
 *
 * This is the seam the rest of the app was written against: every service takes
 * a `merchantId` as its first argument, and until the sign-in screen existed
 * this file resolved the single seeded merchant instead. Swapping that body for
 * the cookie read below changed one file — no route, no service and no page
 * moved, which was the whole point of insisting on the argument.
 *
 * Nothing is memoised across requests. Identity is the last thing a server
 * should remember between them, and a reseed proved it concretely: the seed
 * mints new ids, and a process holding an old one never asks whether it is
 * still real.
 */

/**
 * The signed-in user, or null. The cookie carries only an id, so the row is
 * read every time — which is what makes deleting a user take effect at once
 * rather than whenever their cookie happens to expire, and what makes a cookie
 * minted before a reseed resolve to "signed out" instead of to a ghost.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, merchantId: true },
  });
}

/**
 * Two doors into the same seam, because a refusal is not one thing.
 *
 * `requireUser` throws, and the error map turns that into a 401 with a body —
 * right for a route handler, whose caller is a program that has to read the
 * status. `requireSignedIn` redirects, which is right for a page, whose caller
 * is a person who needs the form rather than a status code. Giving both to one
 * function would mean a page answering 401 into the void, or an API route
 * replying to `fetch` with the HTML of a login screen.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Sign in to continue');

  return user;
}

export async function requireSignedIn(): Promise<SessionUser> {
  const user = await currentUser();
  // No `?next=`: nothing stamps the requested path onto the request, and adding
  // a middleware to do it would put a second decision about who is signed in
  // next to this one. Five screens, all one click from the overview.
  if (!user) redirect('/login');

  return user;
}

export async function requireMerchantId(): Promise<string> {
  return (await requireUser()).merchantId;
}

/**
 * Who to record as the actor on anything this request writes. Channel-driven
 * writes pass their own label (`channel:mock_a`); everything a human clicks in
 * the dashboard is now the address they signed in with, so the order timeline
 * names a person rather than a constant.
 */
export async function currentActor(): Promise<string> {
  return (await requireUser()).email;
}
