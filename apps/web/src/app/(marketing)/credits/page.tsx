import type { Metadata } from 'next';
import Image from 'next/image';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';
import samples from '@/lib/vision-samples.json';
import type { Sample } from '@/components/marketing/ScanHud';
import { CLASS_CODE } from '@/components/marketing/ScanHud';

export async function generateMetadata(): Promise<Metadata> {
  const c = marketing[await getLocale()].creditsPage;
  return { title: c.title, description: c.lead };
}

export default async function Credits() {
  const locale = await getLocale();
  const c = marketing[locale].creditsPage;
  const photos = Object.entries(samples.photos as Record<string, Sample>);
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="t-display">{c.title}</h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">{c.lead}</p>
      <p className="mt-2 text-xs text-ink-3">{samples.model} · {samples.version} · ONNX {samples.onnx_sha256.slice(0, 12)}… · {samples.run_at.slice(0, 10)}</p>
      <ul className="mt-10 divide-y divide-line rounded-2xl border border-line bg-surface">
        {photos.map(([k, s]) => (
          <li key={k} className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-lg sm:w-44"><Image src={s.src} alt="" fill sizes="176px" className="object-cover" /></div>
            <dl className="grid flex-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div><dt className="t-label">{c.photo}</dt><dd><a href={s.credit.source} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">{s.credit.title.replace(/^File:/, '')}</a></dd></div>
              <div><dt className="t-label">{c.author}</dt><dd>{s.credit.author}</dd></div>
              <div><dt className="t-label">{c.licence}</dt><dd>{s.credit.licence_url ? <a href={s.credit.licence_url} target="_blank" rel="noreferrer" className="hover:underline">{s.credit.licence}</a> : s.credit.licence}</dd></div>
              <div><dt className="t-label">{c.changes}</dt><dd className="text-ink-2">{s.credit.changes}</dd></div>
              <div className="sm:col-span-2"><dt className="t-label">{c.detections}</dt><dd className="font-mono text-xs text-ink-2">{s.detections.length ? s.detections.map((d) => `${CLASS_CODE[d.label]} ${d.confidence.toFixed(2)}`).join(' · ') : c.none} · {s.inference_ms} ms</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
