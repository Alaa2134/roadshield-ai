import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/ui/client';
import { MobileMenu } from './MobileMenu';
import type { Locale } from '@/lib/i18n/dict';
import { marketing } from '@/lib/i18n/marketing';

export function MarketingHeader({ locale, dark = true }: { locale: Locale; dark?: boolean }) {
  const n = marketing[locale].nav;
  const links = [
    { href: '/platform', label: n.platform }, { href: '/vision', label: n.vision }, { href: '/finance', label: n.finance },
    { href: '/solutions', label: n.solutions }, { href: '/security', label: n.security }, { href: '/pricing', label: n.pricing },
  ];
  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${dark ? 'border-white/8 bg-[#141922]/92' : 'border-line bg-bg/80'}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="RoadShield AI home"><Logo dark={dark} /></Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-2 text-[13.5px] font-[520] transition-colors ${dark ? 'text-[#C3CFDF] hover:bg-white/6 hover:text-white' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} dark={dark} />
          <Link href="/sign-in" className={`btn btn-sm hidden sm:inline-flex ${dark ? 'btn-on-dark' : 'btn-secondary'}`}>{n.signIn}</Link>
          <Link href="/demo" className="btn btn-sm hidden rounded-[4px] bg-[#f3b33d] font-[650] text-[#141922] hover:bg-[#e7a52a] sm:inline-flex">{n.demo}</Link>
          <MobileMenu links={[...links, { href: '/about', label: n.about }, { href: '/contact', label: n.contact }, { href: '/sign-in', label: n.signIn }, { href: '/demo', label: n.demo }]} dark={dark} />
        </div>
      </div>
    </header>
  );
}
