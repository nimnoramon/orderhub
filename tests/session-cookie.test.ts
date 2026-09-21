import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_TTL_SECONDS,
  mintSession,
  readSession,
  sessionCookieOptions,
} from '@/server/auth/cookie';

/**
 * The session cookie, which is the only thing standing between a visitor and
 * the merchant's data. No database and no HTTP here: this is about whether a
 * string can be forged, and that question is answerable on its own.
 */

const SECRET = 'test-secret-not-the-real-one';
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', SECRET);
});

describe('minting and reading', () => {
  it('reads back the user it was minted for', () => {
    const { value } = mintSession('user_abc', NOW);

    expect(readSession(value, NOW)).toEqual({ userId: 'user_abc' });
  });

  it('expires a week after it was minted', () => {
    const { value, expiresAt } = mintSession('user_abc', NOW);

    expect(expiresAt.getTime()).toBe(NOW + SESSION_TTL_SECONDS * 1000);
    expect(readSession(value, expiresAt.getTime() - 1000)).toEqual({ userId: 'user_abc' });
    expect(readSession(value, expiresAt.getTime())).toBeNull();
    expect(readSession(value, expiresAt.getTime() + 1)).toBeNull();
  });

  it('treats a missing or malformed cookie as signed out rather than as an error', () => {
    expect(readSession(undefined, NOW)).toBeNull();
    expect(readSession('', NOW)).toBeNull();
    expect(readSession('no-separator', NOW)).toBeNull();
    expect(readSession('.signature-only', NOW)).toBeNull();
  });
});

describe('what it refuses', () => {
  it('refuses a payload edited after signing', () => {
    const { value } = mintSession('user_abc', NOW);
    const [, signature] = value.split('.');

    // The id somebody would rather be, carrying the signature of the id they are.
    const forged = Buffer.from(JSON.stringify({ u: 'user_root', e: 9_999_999_999 })).toString(
      'base64url',
    );

    expect(readSession(`${forged}.${signature}`, NOW)).toBeNull();
  });

  it('refuses a signature that was not made by this secret', () => {
    const { value } = mintSession('user_abc', NOW);

    vi.stubEnv('SESSION_SECRET', 'a-different-secret');
    expect(readSession(value, NOW)).toBeNull();

    // And the same string is accepted again once the right secret is back, so
    // the test above is about the key and not about the encoding.
    vi.stubEnv('SESSION_SECRET', SECRET);
    expect(readSession(value, NOW)).toEqual({ userId: 'user_abc' });
  });

  it('refuses a signature of the right shape over the wrong payload', () => {
    const other = mintSession('user_xyz', NOW);
    const [payload] = mintSession('user_abc', NOW).value.split('.');
    const [, signature] = other.value.split('.');

    expect(readSession(`${payload}.${signature}`, NOW)).toBeNull();
  });

  it('refuses a cookie that is signed but is not the JSON this code writes', () => {
    // Anything the signature covers is still parsed defensively: a cookie from
    // an older shape of this payload must read as "signed out", not throw.
    const { value } = mintSession('user_abc', NOW);
    const [, signature] = value.split('.');
    const garbage = Buffer.from('not json at all').toString('base64url');

    expect(() => readSession(`${garbage}.${signature}`, NOW)).not.toThrow();
    expect(readSession(`${garbage}.${signature}`, NOW)).toBeNull();
  });
});

describe('the attributes it is set with', () => {
  it('is httpOnly and same-site, so script cannot read it and another site cannot send it', () => {
    const options = sessionCookieOptions(new Date(NOW));

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
  });

  it('is secure everywhere but development, where localhost is plain http', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(sessionCookieOptions(new Date(NOW)).secure).toBe(false);

    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieOptions(new Date(NOW)).secure).toBe(true);
  });
});
