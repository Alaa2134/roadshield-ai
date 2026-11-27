import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/ui/client';
import { MapArt } from '@/components/marketing/visuals';
import { getDict } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getDict();
  const m = marketing[locale];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="RoadShield AI home"><Logo /></Link>
          <LanguageSwitcher locale={locale} />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-center text-xs text-ink-3">{t.brand.slogan}</p>
      </div>
      <aside className="hero-glow relative hidden overflow-hidden lg:block">
        <MapArt className="absolute inset-0 h-full w-full opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-transparent" />
        <div className="absolute inset-x-12 bottom-14 text-white">
          <p className="t-eyebrow text-cyan">{t.brand.os}</p>
          <h2 className="t-display mt-3 max-w-md">{m.hero.title}</h2>
          <p className="mt-4 max-w-md text-[#B9C6D8]">{m.hero.lead}</p>
        </div>
      </aside>
    </div>
  );
}
