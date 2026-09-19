/**
 * The public demo's own facts.
 *
 * The login is printed on the landing page on purpose: this is a portfolio
 * demo with fictional data, and a reviewer should not have to hunt for a way
 * in. The seed hashes the same values, so overriding either variable changes
 * the account and the screen together.
 *
 * Server-only — it lives under src/server because `process.env` is empty in the
 * client bundle, where these would silently fall back to the defaults.
 */
export const demoLogin = () => ({
  email: process.env.DEMO_EMAIL ?? 'demo@orderhub.dev',
  password: process.env.DEMO_PASSWORD ?? 'demo1234',
});

/** Host and database of the connection in use, for a script to print. Never the password. */
export function databaseTarget(url = process.env.DATABASE_URL): string {
  if (!url) return 'no DATABASE_URL set';
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}
