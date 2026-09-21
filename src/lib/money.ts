// Money is integer minor units everywhere except here. Nothing else in the app
// should build a currency string, and nothing should turn one back into a number.
//
// The demo sells in baht, whose minor unit is the satang — a hundredth, like a
// cent — so the `…Cents` names still describe what is in the column and every
// amount is still an integer. A currency with a different exponent would need
// the divisor below to come from the currency rather than be a literal.

const formatters = new Map<string, Intl.NumberFormat>();

// The locale is pinned rather than taken from the browser or from the language
// switcher: a server-rendered price formatted one way and re-rendered by the
// client another way is a hydration mismatch. `narrowSymbol` is what makes that
// safe to keep in English — it prints "฿1,290.00" rather than "THB 1,290.00",
// so the number reads the same to both audiences.
function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

export const DEFAULT_CURRENCY = 'THB';

export function formatCents(cents: number, currency = DEFAULT_CURRENCY): string {
  return formatterFor(currency).format(cents / 100);
}

/** "฿290.00" for one price, "฿290.00 – ฿1,290.00" for a spread. */
export function formatCentsRange(
  range: [number, number] | null,
  currency = DEFAULT_CURRENCY,
): string {
  if (!range) return '—';
  const [min, max] = range;
  return min === max ? formatCents(min, currency) : `${formatCents(min, currency)} – ${formatCents(max, currency)}`;
}

/** Signed, for ledger deltas: "+12", "−4". */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
