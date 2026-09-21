import { en, type Messages } from '@/lib/i18n/en';
import { th } from '@/lib/i18n/th';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales';

export type { Messages };
export { DEFAULT_LOCALE };

const DICTIONARIES: Record<Locale, Messages> = { en, th };

/**
 * Both dictionaries, picked at render time.
 *
 * They are imported rather than fetched, which means both ship to the browser —
 * a few kilobytes, and the price of the decision above them: the copy holds
 * functions so each language can decide its own plurals and word order, and a
 * function cannot cross the server/client boundary as a prop. So the provider
 * is handed a locale and looks the messages up on its own side.
 */
export const messagesFor = (locale: Locale): Messages => DICTIONARIES[locale] ?? en;
