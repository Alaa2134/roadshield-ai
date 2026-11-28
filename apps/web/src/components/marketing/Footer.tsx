import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import type { Locale } from '@/lib/i18n/dict';
import { marketing } from '@/lib/i18n/marketing';

export function MarketingFooter({ locale }: { locale: Locale }) {
  const m = marketing[locale]; const n = m.nav;
  const cols = [
    { title: n.product, links: [['/platform', n.platform], ['/vision', n.vision], ['/finance', n.finance], ['/predictive-maintenance', n.predictive], ['/technology', n.technology]] },
    { title: n.solutions, links: [['/solutions', n.solutions], ['/solutions/government', n.government], ['/solutions/contractors', n.contractors], ['/pricing', n.pricing]] },
    { title: n.company, links: [['/about', n.about], ['/contact', n.contact], ['/demo', n.demo], ['/sign-in', n.signIn]] },
    { title: n.legal, links: [['/security', n.security], ['/credits', m.footer.credits]] },
  ];
  return (
    <footer className="border-t border-white/8 bg-[#141922] text-[#bdb7a9]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:px-8">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">{m.footer.tagline}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-[13px] font-[600] text-white">{c.title}</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {c.links.map(([href, label]) => <li key={href}><Link href={href!} className="hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>© {new Date().getFullYear()} {m.footer.rights}</span>
          <span>{m.footer.dataNote}</span>
        </div>
      </div>
    </footer>
  );
}
