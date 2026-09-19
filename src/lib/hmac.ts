import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signing, shared by the sender and the receiver.
 *
 * Both sides of this demo live in one repository, which makes it tempting to
 * have the receiver "verify" by calling the same helper with the same constant.
 * What is shared here is only the primitive — the algorithm and the constant-
 * time compare. The secret is not: the mock reads it from the environment, the
 * adapter reads it from the channel's stored credentials, and a mismatch between
 * the two fails exactly as it would with a real marketplace.
 *
 * Server only — `node:crypto` is not in the client bundle.
 */
const PREFIX = 'sha256=';

/**
 * The timestamp is inside the signed string, not merely sent alongside it.
 * Signing the body alone lets anyone who captured one delivery replay it
 * forever; signing `timestamp.body` means a replay has to keep the original
 * timestamp, which `withinTolerance` then rejects.
 */
export function signBody(secret: string, body: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
  return `${PREFIX}${digest}`;
}

export function verifySignature(
  secret: string,
  body: string,
  timestampSeconds: number,
  header: string | null,
): boolean {
  if (!header?.startsWith(PREFIX)) return false;

  const expected = Buffer.from(signBody(secret, body, timestampSeconds), 'utf8');
  const received = Buffer.from(header, 'utf8');
  // timingSafeEqual throws rather than returns false on a length mismatch, and
  // a wrong-length signature is a failure, not a crash.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Five minutes, the usual window: long enough for a slow retry, short enough to matter. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const withinTolerance = (
  timestampSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean => Math.abs(nowSeconds - timestampSeconds) <= SIGNATURE_TOLERANCE_SECONDS;
