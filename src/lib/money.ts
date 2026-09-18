// Money is integer minor units everywhere except here. Nothing else in the app
// should build a currency string, and nothing should turn one back into a number.

const formatters = new Map<string, Intl.NumberFormat>();

// The locale is pinned rather than taken from the browser: a server-rendered
// price formatted in one locale and re-rendered by the client in another is a
// hydration mismatch, and the demo has no locale switcher to justify the risk.
function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter;
}

export function formatCents(cents: number, currency = 'USD'): string {
  return formatterFor(currency).format(cents / 100);
}

/** "$24.99" for one price, "$24.99 – $49.99" for a spread. */
export function formatCentsRange(range: [number, number] | null, currency = 'USD'): string {
  if (!range) return '—';
  const [min, max] = range;
  return min === max ? formatCents(min, currency) : `${formatCents(min, currency)} – ${formatCents(max, currency)}`;
}

/** Signed, for ledger deltas: "+12", "−4". */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `\u2212${Math.abs(delta)}`;
}
