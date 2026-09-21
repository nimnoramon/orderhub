'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { messagesFor, type Messages } from '@/lib/i18n';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales';

/**
 * The active language, for the handful of components that run in the browser.
 *
 * It takes a locale and not the messages themselves: the dictionaries hold
 * functions, and functions cannot be passed from a server component to a client
 * one. Looking them up on this side costs both dictionaries in the bundle and
 * buys back the thing that matters — each language writing its own sentences
 * rather than filling in someone else's template.
 *
 * The value comes from the root layout, which read the cookie on the server, so
 * the first client render already agrees with the HTML it is hydrating.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);

export const useT = (): Messages => messagesFor(useContext(LocaleContext));
