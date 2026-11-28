import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getLocale } from '@/lib/i18n/server';
import { homeCopy } from '@/lib/i18n/home';
import { Boxes } from '@/components/marketing/ScanHud';
import { DetectedPhoto, sample } from '@/components/marketing/Photos';

/** Real photo + the real detector output, square-cornered like a printed figure. */
function Figure({ k, caption, note, locale, priority = false }: { k: string; caption: string; note?: string; locale: 'en' | 'ar'; priority?: boolean }) {
  const s = sample(k);
  return (
    <figure>
      <div className="relative w-full overflow-hidden bg-[#1b2029]" style={{ aspectRatio: `${s.width}/${s.height}` }} dir="ltr">
        <Image src={s.src} alt={caption} fill priority={priority} sizes="(min-width: 1024px) 46vw, 100vw" className="object-cover" />
        <div className="absolute inset-0"><Boxes dets={s.detections} locale={locale} size="sm" /></div>
      </div>
      <figcaption className="mt-3 grid gap-1 text-[13px] leading-relaxed text-[color:var(--ink-2)]">
        <span className="font-[600] text-[color:var(--ink)]">{caption}</span>
        {note ? <span>{note}</span> : null}
        <a href={s.credit.source} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-[color:var(--ink-3)] hover:underline">
          {s.credit.author.split(/[(,]/)[0]!.trim()} · {s.credit.licence}
        </a>
      </figcaption>
    </figure>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const c = homeCopy[locale];
  return (
    <div className="ed">
      {/* 1. Hero: statement + one real photo with the real model output */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="flex flex-col justify-center">
          <p className="ed-kicker">{c.kicker}</p>
          <h1 className="ed-h1 mt-6">{c.title}</h1>
          <p className="ed-lead mt-7">{c.lead}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link href="/platform" className="btn-amber" data-testid="hero-demo">{c.primary}<ArrowRight size={17} className="flip-rtl" /></Link>
            <Link href="/demo" className="ed-link">{c.secondary}</Link>
          </div>
        </div>
        <Figure k="pothole" caption={c.photoCaption} note={c.photoNote} locale={locale} priority />
      </section>

      {/* Facts, not statistics */}
      <section className="ed-rule border-y">
        <dl className="mx-auto grid max-w-7xl px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {c.facts.map((f, i) => (
            <div key={f.term} className={`ed-rule py-6 md:px-6 ${i ? 'border-t md:border-t-0 md:border-s' : ''} ${i === 2 ? 'md:border-s-0 lg:border-s' : ''} first:md:ps-0`}>
              <dt className="ed-kicker">{f.term}</dt>
              <dd className="mt-2 text-[15px] leading-snug">{f.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 2. The job as a road: five kilometre markers */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-end">
          <div><p className="ed-kicker">{c.stagesKicker}</p><h2 className="ed-h2 mt-4">{c.stagesTitle}</h2></div>
          <p className="ed-lead">{c.stagesLead}</p>
        </div>
        <ol className="relative mt-14 grid gap-10 lg:grid-cols-5 lg:gap-6">
          <div className="ed-centerline absolute inset-x-0 top-[1.05rem] hidden lg:block" aria-hidden />
          {c.stages.map((s) => (
            <li key={s.code} className="relative">
              <span className="relative inline-block bg-[color:var(--asphalt)] px-2.5 py-1.5 font-mono text-[12px] tracking-wider text-[color:var(--amber)]">{s.code}</span>
              <h3 className="mt-5 font-display text-[1.65rem] font-[700] uppercase leading-none rtl:font-arabic rtl:normal-case rtl:text-[1.35rem]">{s.title}</h3>
              <p className="mt-2 font-mono text-[11.5px] uppercase tracking-wide text-[color:var(--ink-3)] rtl:font-arabic rtl:normal-case rtl:tracking-normal rtl:text-[12.5px]">{s.who}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--ink-2)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 3. Real photos, real output, including a known mistake */}
      <section className="ed-dark">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-end">
            <div><p className="ed-kicker">{c.streetKicker}</p><h2 className="ed-h2 mt-4">{c.streetTitle}</h2></div>
            <p className="ed-lead">{c.streetLead}</p>
          </div>
          <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
            {c.shots.map((s) => <DetectedPhoto key={s.key} k={s.key} locale={locale} caption={s.caption} className="!rounded-none" />)}
            <div className="grid content-start gap-4">
              <DetectedPhoto k="cracks-closeup" locale={locale} className="!rounded-none" frame={3 / 2} />
              <div className="border-s-4 border-[color:var(--amber)] ps-4">
                <p className="font-[650]">{c.wrongTitle}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[#bdb7a9]">{c.wrongBody}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The software, as it is */}
      <section className="bg-[color:var(--paper-2)]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-end">
            <div><p className="ed-kicker">{c.productKicker}</p><h2 className="ed-h2 mt-4">{c.productTitle}</h2></div>
            <p className="ed-lead">{c.productLead}</p>
          </div>
          <div className="mt-12 grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <figure>
              <p className="ed-kicker mb-3">{c.officeLabel}</p>
              <Image src={locale === 'ar' ? '/product/overview-ar.webp' : '/product/overview.webp'} alt="" width={1920} height={1200}
                sizes="(min-width: 1024px) 70vw, 100vw" className="ed-rule block h-auto w-full border bg-white" />
            </figure>
            <figure className="mx-auto w-[220px] lg:mx-0">
              <p className="ed-kicker mb-3">{c.fieldLabel}</p>
              <Image src="/product/mobile.webp" alt="" width={780} height={1688} sizes="220px" className="ed-rule block h-auto w-full rounded-[1.6rem] border-[6px] border-[color:var(--asphalt)] bg-white" />
            </figure>
          </div>
          <p className="mt-4 font-mono text-[11px] text-[color:var(--ink-3)]">{c.productNote}</p>
        </div>
      </section>

      {/* 5. Five kinds of money */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:px-8">
        <div>
          <p className="ed-kicker">{c.moneyKicker}</p>
          <h2 className="ed-h2 mt-4">{c.moneyTitle}</h2>
          <p className="ed-lead mt-6">{c.moneyLead}</p>
          <p className="mt-8 border-s-4 border-[color:var(--amber)] ps-4 text-[15px] leading-relaxed">{c.moneyRule}</p>
        </div>
        <dl className="ed-rule border-t">
          {c.money.map((m, i) => (
            <div key={m.term} className="ed-rule grid grid-cols-[2.5rem_1fr] gap-x-4 border-b py-5 sm:grid-cols-[2.5rem_11rem_1fr]">
              <span className="font-mono text-[12px] text-[color:var(--ink-3)]">0{i + 1}</span>
              <dt className="font-[650]">{m.term}</dt>
              <dd className="col-start-2 text-[15px] text-[color:var(--ink-2)] sm:col-start-3">{m.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 6. Limits and access */}
      <section className="ed-rule border-t">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="ed-kicker">{c.notKicker}</p>
            <h2 className="ed-h2 mt-4">{c.notTitle}</h2>
            <ul className="mt-8 grid gap-4">
              {c.notItems.map((t) => (
                <li key={t} className="flex gap-3 text-[15.5px] leading-relaxed">
                  <span className="mt-[0.6em] h-[3px] w-4 shrink-0 bg-[color:var(--ink)]" aria-hidden />{t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="ed-kicker">{c.accessKicker}</p>
            <h2 className="ed-h2 mt-4">{c.accessTitle}</h2>
            <dl className="mt-8 grid gap-6">
              {c.accessItems.map((a) => (
                <div key={a.term}><dt className="font-[650]">{a.term}</dt><dd className="mt-1 text-[15px] leading-relaxed text-[color:var(--ink-2)]">{a.meaning}</dd></div>
              ))}
            </dl>
            <Link href="/security" className="ed-link mt-8">{c.ctaSecondary}<ArrowRight size={15} className="flip-rtl" /></Link>
          </div>
        </div>
      </section>

      {/* 7. One clear ask */}
      <section className="ed-dark">
        <div className="ed-centerline" aria-hidden />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:px-8">
          <div><h2 className="ed-h2">{c.ctaTitle}</h2><p className="ed-lead mt-5">{c.ctaLead}</p></div>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-4 lg:justify-end">
            <Link href="/demo" className="btn-amber">{c.ctaPrimary}<ArrowRight size={17} className="flip-rtl" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
