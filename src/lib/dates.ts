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
