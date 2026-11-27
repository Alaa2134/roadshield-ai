import Link from 'next/link';
import { ArrowRight, Check, Layers, ScanLine, Wallet, TrendingUp, Building2, Landmark, HardHat, Cpu, ShieldCheck } from 'lucide-react';
import { marketing } from '@/lib/i18n/marketing';
import type { Locale } from '@/lib/i18n/dict';
import { VisionVisual, FinanceVisual, PredictVisual, SecurityVisual, WorkflowVisual, MapArt } from './visuals';

const icons = { layers: Layers, scan: ScanLine, wallet: Wallet, trending: TrendingUp, building: Building2, landmark: Landmark, hardhat: HardHat, cpu: Cpu, shield: ShieldCheck };

export function FeaturePageView({ locale, pageKey }: { locale: Locale; pageKey: string }) {
  const m = marketing[locale];
  const p = m.pages[pageKey]!;
  const Icon = icons[p.icon as keyof typeof icons] ?? Layers;
  const visual = p.visual === 'vision' ? <VisionVisual />
    : p.visual === 'finance' ? <FinanceVisual labels={m.home.financePoints} />
    : p.visual === 'predict' ? <PredictVisual />
    : p.visual === 'security' ? <SecurityVisual />
    : p.visual === 'workflow' ? <WorkflowVisual steps={m.home.workSteps} />
    : <div className="overflow-hidden rounded-2xl border border-line shadow-float"><MapArt className="block h-72 w-full" /></div>;
  return (
    <>
      <section className="hero-glow relative overflow-hidden text-white">
        <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <span className="t-eyebrow inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-cyan"><Icon size={14} />{p.eyebrow}</span>
          <h1 className="t-display mt-5 max-w-3xl">{p.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#B9C6D8]">{p.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-lg btn-primary">{m.nav.demo}<ArrowRight size={16} className="flip-rtl" /></Link>
            <Link href="/platform" className="btn btn-lg btn-on-dark">{m.hero.secondary}</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {p.features.map((f) => (
              <article key={f.title} className="card card-pad">
                <h2 className="t-card">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.body}</p>
                {f.bullets ? (
                  <ul className="mt-3 space-y-1.5">
                    {f.bullets.map((b) => <li key={b} className="flex gap-2 text-[13px] text-ink"><Check size={15} className="mt-0.5 shrink-0 text-ok" />{b}</li>)}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
          <div className="lg:sticky lg:top-24">{visual}</div>
        </div>
        {p.principles ? (
          <div className="mt-16">
            <h2 className="t-section">{p.principlesTitle}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {p.principles.map((f) => (
                <div key={f.title} className="rounded-2xl border border-dashed border-line-strong p-5">
                  <h3 className="t-card">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <CtaBand locale={locale} />
    </>
  );
}

export function CtaBand({ locale }: { locale: Locale }) {
  const m = marketing[locale];
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="hero-glow relative overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:px-12">
        <div className="grid-bg absolute inset-0 opacity-50" aria-hidden />
        <div className="relative">
          <h2 className="t-display mx-auto max-w-2xl">{m.home.ctaTitle}</h2>
          <p className="mx-auto mt-4 max-w-xl text-[#B9C6D8]">{m.home.ctaLead}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="btn btn-lg btn-primary">{m.hero.primary}</Link>
            <Link href="/contact" className="btn btn-lg btn-on-dark">{m.nav.contact}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
