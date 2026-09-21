import type { Metadata } from "next";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { currentLocale, serverMessages } from "@/server/i18n/locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverMessages();
  return { title: "OrderHub", description: t.landing.intro };
}

/**
 * The language is resolved here, once, and two things come out of it: the `lang`
 * attribute a screen reader and a translator both read, and the locale the
 * client components below get their copy from.
 *
 * Reading a cookie in the root layout makes every route dynamic. That costs
 * nothing here — each of them already opts out of the full route cache, because
 * a dashboard that can serve a transition-old copy of itself is worse than one
 * that renders per request.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await currentLocale();

  return (
    <html lang={locale}>
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
