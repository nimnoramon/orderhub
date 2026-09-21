import { createHmac } from 'node:crypto';
import { constantTimeEqual } from '@/lib/hmac';

/**
 * The session cookie: a user id and an expiry, signed.
 *
 * Not a JWT. A JWT would bring a library, an algorithm field that has to be
 * pinned, and a header nobody reads, to carry two values between this app and
 * itself. What is actually needed is a signed pair, which is thirty lines of
 * `node:crypto` — and the constant-time compare it verifies with is the one the
 * webhook receiver already uses, because a signature check is a signature check.
 *
 * The cookie says only *who*. Nothing about the merchant, the role or the name
 * travels in it: those are read from the row on every request, so revoking a
 * user is deleting a row rather than waiting for a token to expire.
 *
 * Server only — `node:crypto` is not in the client bundle.
 */

export const SESSION_COOKIE = 'orderhub_session';

/** A week. Long enough that a reviewer coming back tomorrow is still signed in. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Local development gets a constant so a fresh clone runs with nothing but a
 * database, exactly as the rate limiter and the cache do. Production does not:
 * a well-known signing key is not a degraded feature, it is a way in, so the
 * deployment fails loudly the way it already does without `DATABASE_URL`.
 */
const DEV_SECRET = 'orderhub-dev-session-secret';

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return DEV_SECRET;
}

/** `u` is the user id, `e` the expiry in whole seconds. Short because it is in every request. */
type Payload = { u: string; e: number };

const encode = (payload: Payload): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

const sign = (encoded: string): string =>
  createHmac('sha256', secret()).update(encoded).digest('base64url');

export function mintSession(
  userId: string,
  now = Date.now(),
): { value: string; expiresAt: Date } {
  const expiresAt = new Date(now + SESSION_TTL_SECONDS * 1000);
  const encoded = encode({ u: userId, e: Math.floor(expiresAt.getTime() / 1000) });

  return { value: `${encoded}.${sign(encoded)}`, expiresAt };
}

/**
 * The cookie, verified. Returns null for every kind of "no", because a missing
 * cookie, a tampered one and an expired one all mean the same thing to a caller
 * — sign in — and telling them apart is only useful to somebody probing.
 *
 * The signature is checked *before* the payload is parsed. Reading the id out
 * of the JSON first and validating afterwards would mean a request could steer
 * a database lookup with bytes nobody signed.
 */
export function readSession(
  raw: string | undefined | null,
  now = Date.now(),
): { userId: string } | null {
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!constantTimeEqual(sign(encoded), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Payload;
    if (typeof payload.u !== 'string' || typeof payload.e !== 'number') return null;
    if (payload.e * 1000 <= now) return null;

    return { userId: payload.u };
  } catch {
    // Signed, but not by a version of this code that wrote JSON. Still a "no".
    return null;
  }
}

/**
 * `secure` only outside development: a cookie marked secure is never sent over
 * the plain http of `localhost:3000`, which would make signing in locally look
 * broken in a way that takes an hour to find.
 */
export const sessionCookieOptions = (expiresAt: Date) =>
  ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    expires: expiresAt,
  }) as const;

/** Same attributes, no value, already expired — the only way to remove a cookie. */
export const clearedCookieOptions = () => ({ ...sessionCookieOptions(new Date(0)) }) as const;
