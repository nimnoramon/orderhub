// API payloads carry UTC ISO strings; components format them. Same reasoning as
// money.ts — formatting on the server in one timezone and on the client in
// another produces a hydration mismatch, so the timezone is pinned to UTC.

export const toIso = (date: Date): string => date.toISOString();

const dateOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateAndTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatDate = (iso: string): string => dateOnly.format(new Date(iso));

export const formatDateTime = (iso: string): string => `${dateAndTime.format(new Date(iso))} UTC`;

/** How long a sync took. Sub-second runs are the normal case, so they keep their digits. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/**
 * Date filters arrive as `YYYY-MM-DD` from a pair of date inputs and mean whole
 * days in UTC, because that is the timezone every stored timestamp is read in.
 * `to` is inclusive to the person typing it, so it becomes an exclusive bound on
 * the following midnight rather than `23:59:59` — a bound that would silently
 * drop an order placed in the last second of the day.
 */
export const startOfUtcDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/** Which UTC day a moment falls on, in the `YYYY-MM-DD` the filters speak. */
export const utcDay = (moment: Date = new Date()): string => moment.toISOString().slice(0, 10);

export const endOfUtcDayExclusive = (day: string): Date => {
  const end = startOfUtcDay(day);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
};
