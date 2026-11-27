import Link from 'next/link';
import { ArrowRight, Check, ScanLine, TrendingUp, Wallet, Wrench, Sparkles, Globe2, Languages, Coins, Map, Lock, Users, ShieldCheck, ScrollText } from 'lucide-react';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';
import { ProductShowcase, VisionVisual, FinanceVisual, PredictVisual } from '@/components/marketing/visuals';
import { CtaBand } from '@/components/marketing/FeaturePageView';

const pillarIcons = [ScanLine, TrendingUp, Wallet, Wrench, Sparkles];
const globalIcons = [Languages, Coins, Globe2, Map];
const trustIcons = [Lock, Users, ShieldCheck, ScrollText];

function SectionHead({ eyebrow, title, lead, center = false }: { eyebrow?: string; title: string; lead: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      {eyebrow ? <p className="t-eyebrow text-accent-text">{eyebrow}</p> : null}
      <h2 className="t-display mt-3 text-ink">{title}</h2>
      <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{lead}</p>
    </div>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const m = marketing[locale];
  const h = m.home;
  return (
    <>
      {/* 1. Hero */}
      <section className="hero-glow relative overflow-hidden text-white">
        <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 lg:px-8 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center fade-up">
            <span className="t-eyebrow inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-cyan">
              <span className="size-1.5 rounded-full bg-cyan" />{m.hero.eyebrow}
            </span>
            <h1 className="t-hero mt-6">{m.hero.title}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#B9C6D8] sm:text-xl">{m.hero.lead}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/demo" className="btn btn-lg btn-primary" data-testid="hero-demo">{m.hero.primary}<ArrowRight size={16} className="flip-rtl" /></Link>
              <Link href="/platform" className="btn btn-lg btn-on-dark">{m.hero.secondary}</Link>
            </div>
            <p className="mt-6 text-[13px] text-[#7F8EA5]">{m.footer.tagline}</p>
          </div>
          <div className="mx-auto mt-16 max-w-6xl fade-up [animation-delay:120ms]">
            <ProductShowcase label={m.hero.preview} />
          </div>
        </div>
      </section>

      {/* 2. Product showcase: five pillars */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHead title={h.showcaseTitle} lead={h.showcaseLead} center />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {h.pillars.map((p, i) => {
            const Icon = pillarIcons[i]!;
            return (
              <article key={p.title} className="card card-pad group relative overflow-hidden transition-shadow hover:shadow-card">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-teal text-white shadow-soft"><Icon size={19} /></span>
                <h3 className="mt-5 text-[17px] font-[640] tracking-[-0.01em]">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{p.body}</p>
                <span className="absolute end-4 top-4 text-[11px] font-[600] text-ink-3 tabular">0{i + 1}</span>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. AI damage detection */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <SectionHead eyebrow={m.nav.vision} title={h.detectTitle} lead={h.detectLead} />
            <ul className="mt-8 space-y-3">
              {h.detectPoints.map((p) => <li key={p} className="flex gap-3 text-[15px] text-ink"><Check size={18} className="mt-0.5 shrink-0 text-teal" />{p}</li>)}
            </ul>
            <Link href="/vision" className="btn btn-secondary mt-8">{m.nav.vision}<ArrowRight size={15} className="flip-rtl" /></Link>
          </div>
          <VisionVisual />
        </div>
      </section>

      {/* 4. Road asset monitoring + 5. financial intelligence */}
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="order-2 lg:order-1"><FinanceVisual labels={h.financePoints} /></div>
        <div className="order-1 lg:order-2">
          <SectionHead eyebrow={m.nav.finance} title={h.financeTitle} lead={h.financeLead} />
          <Link href="/finance" className="btn btn-secondary mt-8">{m.nav.finance}<ArrowRight size={15} className="flip-rtl" /></Link>
        </div>
      </section>

      {/* 6. Cost prediction and maintenance planning */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <SectionHead eyebrow={m.nav.predictive} title={h.predictTitle} lead={h.predictLead} />
            <div className="mt-8 grid gap-2 sm:grid-cols-2">
              {h.predictPoints.map((p) => <div key={p} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-3.5 py-3 text-sm"><Check size={16} className="text-accent" />{p}</div>)}
            </div>
          </div>
          <PredictVisual />
        </div>
      </section>

      {/* 7. Contractor & work orders */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHead eyebrow={m.nav.contractors} title={h.workTitle} lead={h.workLead} center />
        <ol className="relative mt-14 grid gap-4 md:grid-cols-4">
          <div className="absolute inset-x-[12%] top-6 hidden h-px bg-gradient-to-r from-brand via-teal to-ok md:block" aria-hidden />
          {h.workSteps.map((s, i) => (
            <li key={s.title} className="relative text-center">
              <span className="relative mx-auto grid size-12 place-items-center rounded-2xl border border-line bg-surface text-[15px] font-[650] text-accent-text shadow-card">{i + 1}</span>
              <h3 className="mt-4 t-card">{s.title}</h3>
              <p className="mx-auto mt-1.5 max-w-[240px] text-sm leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 8. Global capabilities */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="t-display">{h.globalTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[#A9B6C9]">{h.globalLead}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {h.globalPoints.map((g, i) => {
              const Icon = globalIcons[i]!;
              return (
                <div key={g.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <Icon size={20} className="text-cyan" />
                  <h3 className="mt-4 font-[600]">{g.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#A9B6C9]">{g.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 9. Security & integrity */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <SectionHead eyebrow={m.nav.security} title={h.trustTitle} lead={h.trustLead} />
            <Link href="/security" className="btn btn-secondary mt-8">{m.nav.security}<ArrowRight size={15} className="flip-rtl" /></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {h.trustPoints.map((t, i) => {
              const Icon = trustIcons[i]!;
              return (
                <div key={t.title} className="card card-pad">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text"><Icon size={17} /></span>
                  <h3 className="mt-4 t-card">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 10. Request demonstration */}
      <CtaBand locale={locale} />
    </>
  );
}
