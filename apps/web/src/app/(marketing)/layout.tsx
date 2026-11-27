import { MarketingHeader } from '@/components/marketing/Header';
import { MarketingFooter } from '@/components/marketing/Footer';
import { getLocale } from '@/lib/i18n/server';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <MarketingHeader locale={locale} />
      <main id="main" className="flex-1">{children}</main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
