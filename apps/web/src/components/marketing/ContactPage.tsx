import { Mail, ShieldCheck, Map } from 'lucide-react';
import { marketing } from '@/lib/i18n/marketing';
import type { Locale } from '@/lib/i18n/dict';
import { ContactForm } from './ContactForm';

export function ContactPage({ locale, kind }: { locale: Locale; kind: 'contact' | 'demo' }) {
  const m = marketing[locale];
  const c = m.contact;
  return (
    <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:px-8 lg:py-24">
      <div>
        <h1 className="t-display">{kind === 'demo' ? c.demoTitle : c.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{kind === 'demo' ? c.demoLead : c.lead}</p>
        <ul className="mt-10 space-y-5">
          {[{ i: Map, t: m.home.ctaTitle, b: m.home.ctaLead }, { i: ShieldCheck, t: m.nav.security, b: m.home.trustLead }, { i: Mail, t: m.nav.contact, b: c.privacy }].map((x) => (
            <li key={x.t} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text"><x.i size={18} /></span>
              <div><p className="t-card">{x.t}</p><p className="mt-1 text-sm leading-relaxed text-ink-2">{x.b}</p></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-6 sm:p-8"><ContactForm locale={locale} kind={kind} /></div>
    </section>
  );
}
