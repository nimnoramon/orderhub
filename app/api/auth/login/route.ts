import { signIn } from '@/lib/schemas/auth';
import { SESSION_COOKIE, mintSession, sessionCookieOptions } from '@/server/auth/cookie';
import { json, readJson, route } from '@/server/http/handler';
import { signIn as authenticate } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

/**
 * Who is asking, as far as a rate limiter should care.
 *
 * `x-forwarded-for` is a list when the request crossed more than one proxy, and
 * the client is the first entry. It is trivially spoofable in general — which
 * is why it only ever feeds the throttle, never a decision about identity — but
 * on Vercel the platform rewrites it, so it is the address it claims to be.
 */
const clientAddress = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

/**
 * POST /api/auth/login
 *
 * Parse, authenticate, mint the cookie. The service checks the password and
 * knows nothing about HTTP; the cookie is set here, because that is what a
 * cookie is.
 */
export const POST = route(async (request: Request) => {
  const input = signIn.parse(await readJson(request));
  const user = await authenticate(input, clientAddress(request));

  const session = mintSession(user.id);
  const response = json({ user: { email: user.email, name: user.name } });
  response.cookies.set(SESSION_COOKIE, session.value, sessionCookieOptions(session.expiresAt));

  return response;
});
