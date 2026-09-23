import { createHash } from 'node:crypto';

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

/** One signed-in person's question budget for the ask panel. Hash of { tokens, ts }. */
export const askKey = (userId: string): string => `${prefix()}:ask:${userId}`;

/**
 * How many questions this deployment has answered today. A plain counter.
 *
 * Deliberately not per merchant and not per user: the two buckets above protect
 * a marketplace and a password from one caller, and this protects a credit card
 * from all of them at once. The day is in the key rather than being reset by a
 * job, so expiry does the cleanup and a counter that is never read again simply
 * disappears.
 */
export const askDayKey = (day: string): string => `${prefix()}:ask:day:${day}`;

/**
 * Sign-in attempts from one address and one client. Hash of { tokens, ts }.
 *
 * The identity is hashed rather than spelled out. Every other key here is made
 * of ids this app generated; this one would be made of an email and an IP, and
 * Redis is the one store in this project that is not the system of record and
 * not backed up — putting a list of who tried to sign in and from where into a
 * cache is a thing to be asked about, not a thing to do by default. The digest
 * is as unique as the identity, which is all the bucket needs.
 */
export const loginKey = (identity: string): string =>
  `${prefix()}:login:${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
