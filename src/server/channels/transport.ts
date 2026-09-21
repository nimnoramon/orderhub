import { AppError } from '@/server/http/errors';

/**
 * The HTTP a connector speaks. One place, so every adapter times out the same
 * way, fails the same way, retries the same way, and never leaves a caller
 * holding an un-parsed body.
 *
 * The mock marketplaces are routes in this same deployment and could have been
 * imported as functions. Going over the wire instead is the point: it is what
 * makes the timeout, the status handling and the response validation real code
 * rather than decoration, and it is the difference between a connector and a
 * function call wearing a connector's name.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

/** Two retries, then give up. Short enough to stay inside one request. */
const BACKOFF_MS = [200, 500];

/**
 * A channel answered, and said no. Kept distinct from a transport failure
 * because the status is the thing an adapter branches on — MockShop B has to
 * tell a 429 it should back off from a 500 it should try again.
 */
export class ChannelHttpError extends AppError {
  readonly status: number;
  readonly payload: unknown;
  /** From `Retry-After`, when the channel sent one. Seconds, never a date. */
  readonly retryAfterSeconds?: number;

  constructor(label: string, status: number, payload: unknown, retryAfterSeconds?: number) {
    super('CHANNEL_ERROR', `${label} answered ${status}`, { status, payload, retryAfterSeconds });
    this.name = 'ChannelHttpError';
    this.status = status;
    this.payload = payload;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Read the body whatever it turns out to be — an error page is not always JSON. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

/**
 * `Retry-After` is either a number of seconds or an HTTP date, and a caller that
 * handles only the first spelling discovers the second in production. Both are
 * normalised to seconds here so no adapter has to know there were two.
 */
function retryAfterFrom(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));

  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt(
  label: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    // No status, so nothing to branch on: DNS, a refused connection and a
    // timeout are the same answer — the channel did not reply.
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new AppError('CHANNEL_ERROR', `${label} did not respond (${reason})`);
  }

  const body = await readBody(response);
  if (!response.ok) throw new ChannelHttpError(label, response.status, body, retryAfterFrom(response));
  return body;
}

/**
 * `retries` is opt-in and per call, because whether a request may be sent twice
 * is a property of the endpoint, not of the transport: a GET always may, and a
 * write only may if the channel documents it as idempotent.
 *
 * Only 5xx and "no answer at all" are retried. A 429 is not — the channel has
 * just said it is being asked too often, and asking again 200ms later is the
 * one response guaranteed to be wrong. Backing off from a rate limit belongs to
 * the limiter that should have prevented it, which is milestone 6's token
 * bucket, not to this loop.
 */
export async function requestJson(
  label: string,
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<unknown> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0, ...rest } = init;

  for (let tries = 0; ; tries += 1) {
    try {
      return await attempt(label, url, rest, timeoutMs);
    } catch (error) {
      const retryable =
        error instanceof ChannelHttpError ? error.status >= 500 : error instanceof AppError;
      if (!retryable || tries >= retries) throw error;
      await sleep(BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)]);
    }
  }
}
