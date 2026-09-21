import { cookies } from 'next/headers';
import { cache } from 'react';
import { messagesFor, type Messages } from '@/lib/i18n';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@/lib/i18n/locales';

/**
 * Which language this request is in.
 *
 * The same seam as `src/server/auth/session.ts`, and for the same reason: every
 * page and every server component asks one function instead of threading a
 * locale through props. An unset or hand-edited cookie reads as the default
 * rather than throwing — a broken preference should show English, not a 500.
 *
 * `Accept-Language` is deliberately ignored. The choice is the switcher's, it
 * is visible on every screen, and a header that quietly overrode it would make
 * the button look broken to anyone whose browser disagrees with them.
 */
export const currentLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** The copy for this request, for server components. Client ones use `useT`. */
export const serverMessages = cache(async (): Promise<Messages> => messagesFor(await currentLocale()));
