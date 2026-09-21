/**
 * Which failures are worth trying again, and when.
 *
 * This is the judgement the retry queue is built on, so it lives on its own and
 * is tested on its own. Retrying everything is the easy mistake: a catalog item
 * MockShop B rejected because it does not carry that category will be rejected
 * in exactly the same way in fifteen seconds, in thirty, and in four minutes,
 * and all a retry buys is a sync log nobody can read and a quota spent on a
 * foregone conclusion.
 *
 * The rule is therefore about *who* said no. A code this app produced —
 * the channel was unreachable, the channel broke, we ran out of request budget,
 * we have a bug — describes a moment, and moments pass. A code the channel
 * produced about one item is a verdict on that item, and verdicts do not.
 */

import type { SyncFailure } from '@/lib/types';

/**
 * Our own error codes, and only ours. The channels answer in their own
 * vocabularies (`PRICE_FORMAT`, `CATEGORY_NOT_LISTED`, `TOO_MANY_ITEMS`), and
 * anything not on this list is by definition something a marketplace decided.
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  // No answer, or a 5xx. The transport already retried it twice inside the run.
  'CHANNEL_ERROR',
  // Our own limiter stopped the call. Nothing was sent, so nothing is settled.
  'RATE_LIMITED',
  // A bug on this side. Worth one more go, and worth seeing in the log.
  'INTERNAL',
]);

export const isRetryable = (failure: SyncFailure): boolean => RETRYABLE_CODES.has(failure.code);

/**
 * The delay before attempt N+1, having failed N times.
 *
 * Fifteen seconds doubling — 15s, 30s, 1m, 2m, 4m — then the item is abandoned.
 * Production would start at a minute or two; this is a demo somebody clicks
 * through, and a first retry that lands after they have closed the tab teaches
 * them nothing. The shape is the point, not the constant.
 */
export const RETRY_BASE_MS = 15_000;

/** Attempts *after* the original. Six calls in total, then the item is dropped. */
export const MAX_RETRIES = 5;

/** ±20%, so a hundred items that failed together do not come back together. */
const JITTER = 0.2;

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  // random() is in [0, 1), so the spread is [-JITTER, +JITTER) of the base.
  return Math.round(base * (1 + (random() * 2 - 1) * JITTER));
}
