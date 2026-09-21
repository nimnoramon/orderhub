/**
 * Every Redis key this app writes, spelled in one file.
 *
 * The prefix carries the environment because one Upstash database serves every
 * deployment of this project: production, each preview, and a laptop all point
 * at the same URL unless somebody pays for a second one. Without the prefix a
 * preview branch's catalog retries would drain production's queue and a stale
 * preview summary would be served to a real visitor — a class of bug that is
 * very hard to see and trivial to prevent.
 */

const prefix = (): string => `oh:${process.env.VERCEL_ENV ?? 'local'}`;

/** Token bucket state for one channel row. Hash of { tokens, ts }. */
export const bucketKey = (channelId: string): string => `${prefix()}:rl:${channelId}`;

/** Catalog items waiting to be pushed again. Sorted set of sku -> due time. */
export const retryQueueKey = (channelId: string): string => `${prefix()}:retry:${channelId}`;

/** How many times each queued sku has already failed. Hash of sku -> attempt. */
export const retryTriesKey = (channelId: string): string => `${prefix()}:retry:${channelId}:tries`;

/** The cached dashboard summary. One per merchant, because the data is. */
export const dashboardKey = (merchantId: string): string => `${prefix()}:dash:${merchantId}`;
