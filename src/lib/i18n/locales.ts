/**
 * Which languages exist, and the cookie that remembers the choice.
 *
 * Shared by both sides on purpose: the switcher writes the cookie in the
 * browser and the server reads it back, so the name and the attributes have to
 * be one definition rather than two that agree today.
 */

export const LOCALES = ['en', 'th'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * English, because this is a public portfolio demo and its first visitor is as
 * likely to be a recruiter abroad as a colleague here. The switcher is the
 * second thing on the screen, and the choice sticks for a year.
 */
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'oh_locale';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * A display preference is not a credential, so — unlike the session cookie —
 * this one is written by the browser and is deliberately readable there. That
 * is what saves a round trip to a route handler every time somebody switches
 * language; `SameSite=Lax` still keeps it off cross-site requests.
 *
 * The write lives beside the name and the attributes rather than in the button
 * that calls it, so there is one place that knows how this cookie is spelled
 * and the component stays a component.
 */
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
