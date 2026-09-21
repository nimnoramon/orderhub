'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useLocale, useT } from '@/components/ui/I18nProvider';
import { LOCALES, rememberLocale, type Locale } from '@/lib/i18n/locales';

/**
 * Two buttons and a cookie.
 *
 * Unlike signing out, this posts to nothing: the preference is not a credential,
 * so the browser writes the cookie itself and the only thing left to do is ask
 * the server to render the page again with it. `router.refresh()` re-runs the
 * server components — every screen in this app is dynamic — so the whole page
 * comes back translated without a reload and without losing scroll position.
 */
export function LocaleSwitch({ className = '' }: { className?: string }) {
  const router = useRouter();
  const active = useLocale();
  const t = useT();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === active) return;
    rememberLocale(locale);
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md border border-neutral-200 p-0.5 ${className}`}
      role="group"
      aria-label={t.language.label}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          disabled={pending}
          aria-pressed={locale === active}
          title={t.language.switchTo(t.language.names[locale])}
          className={
            locale === active
              ? 'rounded px-2 py-0.5 text-xs font-medium text-teal-800 bg-teal-50'
              : 'rounded px-2 py-0.5 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50'
          }
        >
          {t.language[locale]}
        </button>
      ))}
    </div>
  );
}
