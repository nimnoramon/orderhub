import { AppError } from '@/server/http/errors';

/**
 * The HTTP a connector speaks. One place, so every adapter times out the same
 * way, fails the same way, and never leaves a caller holding an un-parsed body.
 *
 * The mock marketplaces are routes in this same deployment and could have been
 * imported as functions. Going over the wire instead is the point: it is what
 * makes the timeout, the status handling and the response validation real code
 * rather than decoration, and it is the difference between a connector and a
 * function call wearing a connector's name.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * A channel answered, and said no. Kept distinct from a transport failure
 * because the status is the thing an adapter branches on — milestone 5's
 * MockShop B has to tell a 429 it should back off from a 500 it should retry.
 */
export class ChannelHttpError extends AppError {
  readonly status: number;
  readonly payload: unknown;

  constructor(label: string, status: number, payload: unknown) {
    super('CHANNEL_ERROR', `${label} answered ${status}`, { status, payload });
    this.name = 'ChannelHttpError';
    this.status = status;
    this.payload = payload;
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

export async function requestJson(
  label: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    // No status, so nothing to branch on: DNS, a refused connection and a
    // timeout are the same answer — the channel did not reply.
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new AppError('CHANNEL_ERROR', `${label} did not respond (${reason})`);
  }

  const body = await readBody(response);
  if (!response.ok) throw new ChannelHttpError(label, response.status, body);
  return body;
}
