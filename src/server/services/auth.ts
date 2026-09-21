import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db';
import { AppError } from '@/server/http/errors';
import { loginLimiter } from '@/server/ratelimit/limiter';
import type { SignInInput } from '@/lib/schemas/auth';
import type { SessionUser } from '@/lib/types';

/**
 * Checking a password, and nothing else.
 *
 * The service knows about users and bcrypt; it does not know what a cookie is.
 * Minting the session is the route handler's job, because a cookie is a piece
 * of HTTP — the same division that keeps every other service in this project
 * free of `NextResponse`.
 */

/**
 * A real bcrypt hash of a password nobody has.
 *
 * An unknown email must cost the same as a known one. Returning early when the
 * lookup finds nothing would answer in a millisecond where a real account takes
 * a hundred, and that difference is enough to sort a list of addresses into
 * "has an account here" and "does not" — the standard way user enumeration is
 * found, and free to prevent.
 */
const NO_SUCH_USER_HASH = '$2b$10$OrderHubDummySaltxxxxu76UadkohIJC.LyinI8I0cfWwNQMUr/W';

/**
 * `client` is whatever the route can tell about who is asking — the forwarded
 * address, paired with the email being tried. Pacing on the pair rather than on
 * the address alone means one office behind one IP cannot lock each other out,
 * and pacing on it at all is what stops a demo whose password is printed on the
 * landing page from being a free password-guessing endpoint for other people's
 * accounts.
 */
export async function signIn(input: SignInInput, client: string): Promise<SessionUser> {
  await loginLimiter(`${input.email}|${client}`).acquire();

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, merchantId: true, passwordHash: true },
  });

  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? NO_SUCH_USER_HASH);

  // One message for both halves of the answer. "No such account" and "wrong
  // password" are the same thing to somebody signing in and two different
  // things to somebody guessing.
  if (!user || !matches) {
    throw new AppError('UNAUTHORIZED', 'That email and password do not match an account');
  }

  return { id: user.id, email: user.email, name: user.name, merchantId: user.merchantId };
}
