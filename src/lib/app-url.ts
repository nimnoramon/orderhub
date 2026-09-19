/**
 * Where this app answers HTTP, from its own point of view.
 *
 * The mock marketplaces are routes in this same deployment, so the connector
 * reaches them over real HTTP rather than by importing them — that is the whole
 * point of the exercise, and it is the one call an adapter makes that would look
 * identical if MockShop A were a company. Which means the app needs to know its
 * own origin.
 *
 * `VERCEL_URL` is the per-deployment host and carries no scheme; it is the
 * fallback so a preview deployment talks to itself rather than to production.
 */
export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
