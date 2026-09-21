import { SESSION_COOKIE, clearedCookieOptions } from '@/server/auth/cookie';
import { json, route } from '@/server/http/handler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout
 *
 * POST and not GET: a link that signs you out can be put in an image tag on
 * somebody else's page, and then a visit to that page signs you out here.
 *
 * It answers 200 whether or not there was a session to end — signing out is a
 * statement of intent, not a query, and "you were not signed in" is not a
 * failure anybody can act on. There is nothing to revoke server-side: the
 * cookie is the session, so removing it is the whole operation.
 */
export const POST = route(async () => {
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', clearedCookieOptions());

  return response;
});
