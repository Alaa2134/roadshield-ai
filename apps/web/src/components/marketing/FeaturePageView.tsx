import Link from 'next/link';
import { ArrowRight, Check, Layers, ScanLine, Wallet, TrendingUp, Building2, Landmark, HardHat, Cpu, ShieldCheck } from 'lucide-react';
import { marketing } from '@/lib/i18n/marketing';
import type { Locale } from '@/lib/i18n/dict';
import { DetectedPhoto } from './Photos';
import { FinanceVisual, PredictVisual, SecurityVisual, WorkflowVisual, MapArt } from './visuals';

const icons = { layers: Layers, scan: ScanLine, wallet: Wallet, trending: TrendingUp, building: Building2, landmark: Landmark, hardhat: HardHat, cpu: Cpu, shield: ShieldCheck };

/** Shared editorial layout for every public feature page (platform, vision, finance, ...). */
export function FeaturePageView({ locale, pageKey }: { locale: Locale; pageKey: string }) {
  const m = marketing[locale];
  const p = m.pages[pageKey]!;
  const Icon = icons[p.icon as keyof typeof icons] ?? Layers;
  const visual = p.visual === 'vision' ? <div className="grid gap-4"><DetectedPhoto k="pothole" locale={locale} caption={m.home.shots[1]!.caption} /><DetectedPhoto k="alligator-cracking" locale={locale} caption={m.home.shots[0]!.caption} /></div>
    : p.visual === 'finance' ? <FinanceVisual labels={m.home.financePoints} />
    : p.visual === 'predict' ? <PredictVisual />
    : p.visual === 'security' ? <SecurityVisual />
    : p.visual === 'workflow' ? <WorkflowVisual steps={m.home.workSteps} />
    : <div className="overflow-hidden"><MapArt className="block h-72 w-full" /></div>;
  return (
    <div className="ed">
      <section className="ed ed-dark relative overflow-hidden">
        <div className="contours absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 lg:px-8 lg:pb-20 lg:pt-24">
          <p className="ed-kicker inline-flex items-center gap-2.5"><Icon size={14} aria-hidden />{p.eyebrow}</p>
          <h1 className="ed-h1 mt-6 max-w-5xl">{p.title}</h1>
          <p className="ed-lead mt-7">{p.lead}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link href="/demo" className="btn-amber">{m.nav.demo}<ArrowRight size={17} className="flip-rtl" /></Link>
            <Link href="/platform" className="ed-link">{m.hero.secondary}</Link>
          </div>
        </div>
        <div className="ed-centerline" aria-hidden />
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <ol className="ed-rule border-t">
            {p.features.map((f, i) => (
              <li key={f.title} className="ed-rule grid gap-x-5 border-b py-7 sm:grid-cols-[3rem_1fr]">
                <span className="ed-kicker pt-1.5" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                <article>
                  <h2 className="ed-h3">{f.title}</h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--ink-2)]">{f.body}</p>
                  {f.bullets ? (
                    <ul className="mt-3 space-y-1.5">
                      {f.bullets.map((b) => <li key={b} className="flex gap-2 text-[14px]"><Check size={15} className="mt-0.5 shrink-0 text-[color:var(--amber-ink)]" aria-hidden />{b}</li>)}
                    </ul>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
          <div className="ed-rule border bg-bg p-3 text-ink lg:sticky lg:top-24">{visual}</div>
        </div>
        {p.principles ? (
          <div className="mt-20">
            <p className="ed-kicker">{p.principlesTitle}</p>
            <div className="ed-rule mt-4 grid border-t md:grid-cols-2">
              {p.principles.map((f, i) => (
                <div key={f.title} className={`ed-rule border-b py-6 md:px-6 ${i % 2 ? 'md:border-s' : 'md:ps-0'}`}>
                  <h3 className="ed-h3">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[color:var(--ink-2)]">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <CtaBand locale={locale} />
    </div>
  );
}

export function CtaBand({ locale }: { locale: Locale }) {
  const m = marketing[locale];
  return (
    <section className="ed ed-dark">
      <div className="ed-centerline" aria-hidden />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:px-8">
        <div>
          <h2 className="ed-h2 max-w-2xl">{m.home.ctaTitle}</h2>
          <p className="ed-lead mt-5">{m.home.ctaLead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4 lg:justify-end">
          <Link href="/demo" className="btn-amber">{m.hero.primary}<ArrowRight size={17} className="flip-rtl" /></Link>
          <Link href="/contact" className="ed-link">{m.nav.contact}</Link>
        </div>
      </div>
    </section>
  );
}
