import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';

export async function generateMetadata(): Promise<Metadata> {
  const p = marketing[await getLocale()].pricing;
  return { title: p.title, description: p.lead };
}

export default async function Pricing() {
  const p = marketing[await getLocale()].pricing;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="t-display">{p.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{p.lead}</p>
      </div>
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {p.plans.map((plan, i) => (
          <article key={plan.name} className={`card flex flex-col p-7 ${i === 1 ? 'ring-2 ring-accent shadow-float' : ''}`}>
            <h2 className="text-xl font-[650]">{plan.name}</h2>
            <p className="mt-1.5 min-h-10 text-sm text-ink-2">{plan.for}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((f) => <li key={f} className="flex gap-2.5 text-sm"><Check size={16} className="mt-0.5 shrink-0 text-ok" />{f}</li>)}
            </ul>
            <Link href="/demo" className={`btn btn-lg mt-8 w-full ${i === 1 ? 'btn-primary' : 'btn-secondary'}`}>{plan.cta}</Link>
          </article>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-ink-3">{p.note}</p>
    </section>
  );
}
