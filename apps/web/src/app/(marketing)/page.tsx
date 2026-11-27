import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, ScanLine, TrendingUp, Wallet, Wrench, Sparkles, Languages, Coins, Globe2, Map, Lock, Users, ShieldCheck, ScrollText, TriangleAlert } from 'lucide-react';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';
import { ScanHud } from '@/components/marketing/ScanHud';
import { DetectedPhoto, PlainPhoto, BrowserFrame, PhoneFrame, sample, FillPhoto, photoRatio } from '@/components/marketing/Photos';
import { CompareSlider } from '@/components/interactive/CompareSlider';
import { Lightbox } from '@/components/interactive/Lightbox';
import { Reveal } from '@/components/interactive/Reveal';
import { RoadLayersLazy } from '@/components/three/RoadLayersLazy';
import { FinanceVisual, PredictVisual } from '@/components/marketing/visuals';
import { CtaBand } from '@/components/marketing/FeaturePageView';

const pillarIcons = [ScanLine, TrendingUp, Wallet, Wrench, Sparkles];
const globalIcons = [Languages, Coins, Globe2, Map];
const trustIcons = [Lock, Users, ShieldCheck, ScrollText];

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={`t-eyebrow flex items-center gap-2.5 ${dark ? 'text-[#F5C542]' : 'text-accent-text'}`}>
      <span className={`h-[3px] w-6 rounded-full ${dark ? 'bg-[#F5C542]' : 'bg-accent'}`} />{children}
    </p>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const m = marketing[locale];
  const h = m.home;
  const ov = locale === 'ar' ? '/product/overview-ar.webp' : '/product/overview.webp';
  return (
    <>
      {/* 1. Hero — real photo, real model output */}
      <section className="asphalt relative overflow-hidden text-white">
        <div className="contours absolute inset-0 opacity-70" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-14 sm:px-6 lg:px-8 lg:pt-24">
          <div className="grid items-end gap-8 lg:grid-cols-[1.25fr_1fr]">
            <div className="fade-up">
              <Eyebrow dark>{m.hero.eyebrow}</Eyebrow>
              <h1 className="t-hero mt-5 max-w-3xl">{m.hero.title}</h1>
            </div>
            <div className="fade-up [animation-delay:80ms]">
              <p className="text-lg leading-relaxed text-[#B9C6D8]">{m.hero.lead}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/demo" className="btn btn-lg btn-primary" data-testid="hero-demo">{m.hero.primary}<ArrowRight size={16} className="flip-rtl" /></Link>
                <Link href="/platform" className="btn btn-lg btn-on-dark">{m.hero.secondary}</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 fade-up [animation-delay:140ms]"><ScanHud locale={locale} /></div>
        </div>
        <div className="lane-divider" aria-hidden />
      </section>

      {/* 2. Five stages */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <Eyebrow>RoadShield OS</Eyebrow>
            <h2 className="t-display mt-4">{h.showcaseTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.showcaseLead}</p>
          </div>
          <ol className="relative grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {h.pillars.map((p, i) => {
              const Icon = pillarIcons[i]!;
              return (
                <li key={p.title} className={`relative bg-surface p-6 ${i === 0 ? 'lg:row-span-2' : ''}`}>
                  <div className="flex items-center justify-between">
                    <Icon size={22} strokeWidth={1.6} className="text-accent" />
                    <span className="font-mono text-[12px] text-ink-3">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-[19px] font-[640] tracking-[-0.01em]">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{p.body}</p>
                  {i === 0 ? <div className="mt-6 hidden lg:block"><PlainPhoto k="crack-star" alt="" ratio="4/5" /></div> : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* 3. From the street — real photos, real detections */}
      <section className="asphalt relative overflow-hidden text-white">
        <div className="contours absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow dark>{h.streetEyebrow}</Eyebrow>
            <h2 className="t-display mt-4">{h.streetTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[#A9B6C9]">{h.streetLead}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Lightbox label={h.shots[0]!.caption} ratio="4/3"><DetectedPhoto k={h.shots[0]!.key} locale={locale} caption={h.shots[0]!.caption} /></Lightbox>
            <Lightbox label={h.shots[1]!.caption} ratio="4/3"><DetectedPhoto k={h.shots[1]!.key} locale={locale} caption={h.shots[1]!.caption} /></Lightbox>
            <Lightbox label={h.shots[2]!.caption} ratio="4/3"><DetectedPhoto k={h.shots[2]!.key} locale={locale} caption={h.shots[2]!.caption} /></Lightbox>
            <div className="grid gap-4 sm:col-span-2 lg:col-span-3 lg:grid-cols-3">
              <Lightbox label={h.limitTitle} ratio="16/9"><DetectedPhoto k="cracks-closeup" locale={locale} frame={16 / 9} /></Lightbox>
              <div className="flex flex-col justify-center rounded-2xl border border-[#F5A524]/30 bg-[#F5A524]/[0.07] p-6 lg:col-span-2">
                <div className="flex items-center gap-2.5"><TriangleAlert size={20} className="text-[#F5A524]" /><h3 className="text-[18px] font-[620]">{h.limitTitle}</h3></div>
                <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-[#C9D3E0]">{h.limitBody}</p>
              </div>
            </div>
          </div>
          <ul className="mt-10 grid gap-x-8 gap-y-3 text-[14.5px] text-[#C9D3E0] sm:grid-cols-2">
            {h.detectPoints.map((p) => <li key={p} className="flex gap-3"><Check size={17} className="mt-0.5 shrink-0 text-[#3fd6c8]" />{p}</li>)}
          </ul>
        </div>
      </section>

      {/* 3b. Compare: photo vs real model output */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
        <Reveal>
          <Eyebrow>{h.compareEyebrow}</Eyebrow>
          <h2 className="t-display mt-4">{h.compareTitle}</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.compareLead}</p>
        </Reveal>
        <Reveal delay={80}>
          <CompareSlider ratio={photoRatio('pothole')} leftLabel={h.comparePhoto} rightLabel={h.compareAi}
            left={<FillPhoto k="pothole" locale={locale} />} right={<FillPhoto k="pothole" locale={locale} boxes />} />
        </Reveal>
      </section>

      {/* 4. Product — real screenshots */}
      <section className="relative overflow-hidden bg-bg">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow>{h.productEyebrow}</Eyebrow>
            <h2 className="t-display mt-4">{h.productTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.productLead}</p>
          </div>
          <div className="relative mt-14 pb-10 lg:pe-40">
            <div className="absolute -inset-x-20 top-10 bottom-0 -z-0 rounded-[48px] bg-navy" aria-hidden>
              <div className="contours absolute inset-0 rounded-[48px] opacity-80" />
            </div>
            <div className="relative px-4 pt-10 sm:px-10">
              <BrowserFrame src={ov} alt={h.productTitle} />
            </div>
            <PhoneFrame src="/product/mobile.webp" alt="" className="absolute -bottom-2 end-2 hidden w-[230px] lg:block" />
          </div>
          <p className="mt-6 text-center text-xs text-ink-3">{h.productNote}</p>
        </div>
      </section>

      {/* 5. Finance */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <Eyebrow>{m.nav.finance}</Eyebrow>
            <h2 className="t-display mt-4">{h.financeTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.financeLead}</p>
            <Link href="/finance" className="btn btn-secondary mt-8">{m.nav.finance}<ArrowRight size={15} className="flip-rtl" /></Link>
          </div>
          <div className="relative">
            <BrowserFrame src="/product/project.webp" alt={h.financeTitle} className="rotate-[-1.2deg]" />
            <div className="absolute -bottom-8 start-6 w-[78%] max-w-md rotate-[1.5deg]"><FinanceVisual labels={h.financePoints} /></div>
          </div>
        </div>
      </section>

      {/* 6. Prediction */}
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-28 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="order-2 lg:order-1"><PredictVisual /></div>
        <div className="order-1 lg:order-2">
          <Eyebrow>{m.nav.predictive}</Eyebrow>
          <h2 className="t-display mt-4">{h.predictTitle}</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.predictLead}</p>
          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            {h.predictPoints.map((p) => <div key={p} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm"><Check size={16} className="text-accent" />{p}</div>)}
          </div>
        </div>
      </section>

      {/* 6b. Inside the road — interactive 3D (illustrative) */}
      <section className="asphalt relative overflow-hidden text-white">
        <div className="contours absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:px-8">
          <Reveal>
            <Eyebrow dark>{h.layersEyebrow}</Eyebrow>
            <h2 className="t-display mt-4">{h.layersTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[#A9B6C9]">{h.layersLead}</p>
          </Reveal>
          <RoadLayersLazy labels={h.layers} />
        </div>
      </section>

      {/* 7. Repair — field crews */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="grid lg:grid-cols-2">
          <div className="relative min-h-[320px]">
            <Image src={sample('repair-crew').src} alt={h.repairTitle} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 to-transparent lg:bg-gradient-to-l rtl:lg:bg-gradient-to-r" />
            <a href={sample('repair-crew').credit.source} target="_blank" rel="noreferrer" className="absolute bottom-3 start-3 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/70">{sample('repair-crew').credit.author} · {sample('repair-crew').credit.licence}</a>
          </div>
          <div className="contours relative px-6 py-20 sm:px-12 lg:py-28">
            <Eyebrow dark>{m.nav.contractors}</Eyebrow>
            <h2 className="t-display mt-4">{h.repairTitle}</h2>
            <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-[#A9B6C9]">{h.repairBody}</p>
            <ol className="mt-10 space-y-5">
              {h.workSteps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#F5C542]/50 font-mono text-[13px] text-[#F5C542]">{i + 1}</span>
                  <div><p className="font-[600]">{s.title}</p><p className="mt-0.5 text-sm leading-relaxed text-[#A9B6C9]">{s.body}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="lane-divider" aria-hidden />
      </section>

      {/* 8. Global */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Eyebrow>{m.nav.technology}</Eyebrow>
            <h2 className="t-display mt-4">{h.globalTitle}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.globalLead}</p>
            <div className="mt-8"><BrowserFrame src="/product/map.webp" alt="" /></div>
          </div>
          <div className="grid content-center gap-x-10 gap-y-9 sm:grid-cols-2">
            {h.globalPoints.map((g, i) => {
              const Icon = globalIcons[i]!;
              return (
                <div key={g.title} className="border-t-2 border-ink pt-5">
                  <Icon size={20} strokeWidth={1.6} className="text-accent" />
                  <h3 className="mt-4 text-[17px] font-[620]">{g.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{g.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 9. Security */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <Eyebrow>{m.nav.security}</Eyebrow>
              <h2 className="t-display mt-4">{h.trustTitle}</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{h.trustLead}</p>
              <Link href="/security" className="btn btn-secondary mt-8">{m.nav.security}<ArrowRight size={15} className="flip-rtl" /></Link>
            </div>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {h.trustPoints.map((t, i) => {
                const Icon = trustIcons[i]!;
                return (
                  <div key={t.title} className="flex gap-5 p-6">
                    <Icon size={22} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
                    <div><h3 className="t-card">{t.title}</h3><p className="mt-1 text-sm leading-relaxed text-ink-2">{t.body}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="pt-20"><CtaBand locale={locale} /></div>
    </>
  );
}
