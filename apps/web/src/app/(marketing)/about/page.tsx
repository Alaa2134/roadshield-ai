import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';
import { CtaBand } from '@/components/marketing/FeaturePageView';
import { PlainPhoto } from '@/components/marketing/Photos';

export async function generateMetadata(): Promise<Metadata> {
  const a = marketing[await getLocale()].about;
  return { title: a.title, description: a.lead };
}

export default async function About() {
  const locale = await getLocale();
  const a = marketing[locale].about;
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h1 className="t-display">{a.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-2">{a.lead}</p>
          </div>
          <PlainPhoto k="field-road-ua" alt="" className="shadow-float" ratio="16/10" />
        </div>
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {a.sections.map((s) => (
            <article key={s.title} className="card card-pad">
              <h2 className="t-section">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
            </article>
          ))}
        </div>
      </section>
      <CtaBand locale={locale} />
    </>
  );
}
