import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signing, shared by the senders and the receiver.
 *
 * Both sides of this demo live in one repository, which makes it tempting to
 * have the receiver "verify" by calling the same helper with the same constant.
 * What is shared here is only the primitive — the algorithm and the constant-
 * time compare. The secret is not: the mocks read theirs from the environment,
 * the adapters read theirs from the channel's stored credentials, and a mismatch
 * between the two fails exactly as it would with a real marketplace.
 *
 * Server only — `node:crypto` is not in the client bundle.
 */

/**
 * How a channel spells a digest. MockShop A sends prefixed hex, MockShop B sends
 * bare base64; the prefix travels with the encoding it was written for. Which
 * one a channel uses is part of its dialect and belongs to its adapter, which is
 * why this is a parameter rather than two functions.
 */
export type SignatureFormat = 'hex-prefixed' | 'base64';

const HEX_PREFIX = 'sha256=';

/**
 * The timestamp is inside the signed string, not merely sent alongside it.
 * Signing the body alone lets anyone who captured one delivery replay it
 * forever; signing `timestamp.body` means a replay has to keep the original
 * timestamp, which `withinTolerance` then rejects.
 *
 * The timestamp is whatever number the channel puts on the wire — A counts
 * seconds and B counts milliseconds. What matters is that both ends stringify
 * the same one.
 */
export function signBody(
  secret: string,
  body: string,
  timestamp: number,
  format: SignatureFormat = 'hex-prefixed',
): string {
  const hmac = createHmac('sha256', secret).update(`${timestamp}.${body}`);
  return format === 'base64' ? hmac.digest('base64') : `${HEX_PREFIX}${hmac.digest('hex')}`;
}

/**
 * Compare two strings without letting the time taken say how much of one was
 * right. `timingSafeEqual` throws rather than returns false on a length
 * mismatch, and a wrong-length secret is a failure, not a crash.
 */
export function constantTimeEqual(expected: string, received: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(received, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifySignature(
  secret: string,
  body: string,
  timestamp: number,
  header: string | null,
  format: SignatureFormat = 'hex-prefixed',
): boolean {
  if (!header) return false;
  if (format === 'hex-prefixed' && !header.startsWith(HEX_PREFIX)) return false;

  return constantTimeEqual(signBody(secret, body, timestamp, format), header);
}

/** Five minutes, the usual window: long enough for a slow retry, short enough to matter. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const withinTolerance = (
  timestampSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean => Math.abs(nowSeconds - timestampSeconds) <= SIGNATURE_TOLERANCE_SECONDS;
