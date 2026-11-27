import Image from 'next/image';
import type { Locale } from '@/lib/i18n/dict';
import samples from '@/lib/vision-samples.json';
import { Boxes, type Sample } from './ScanHud';

export const sample = (k: string) => (samples.photos as Record<string, Sample>)[k]!;
const short = (s: Sample) => `${s.credit.author.split(/[(,]/)[0]!.trim()} · ${s.credit.licence}`;

/** Real photo with the real RoadShield Vision boxes drawn on it. */
/** Map normalised boxes from the full image into an object-cover frame of aspect `frame` (w/h). */
function coverBoxes(s: Sample, frame: number) {
  const img = s.width / s.height;
  const fx = img > frame ? frame / img : 1; // visible fraction horizontally
  const fy = img > frame ? 1 : img / frame; // visible fraction vertically
  const ox = (1 - fx) / 2, oy = (1 - fy) / 2;
  return s.detections.map((d) => {
    const [x1, y1, x2, y2] = d.box as [number, number, number, number];
    const b = [(x1 - ox) / fx, (y1 - oy) / fy, (x2 - ox) / fx, (y2 - oy) / fy].map((v) => Math.max(0, Math.min(1, v)));
    return { ...d, box: b };
  }).filter((d) => d.box[2]! - d.box[0]! > 0.02 && d.box[3]! - d.box[1]! > 0.02);
}

export function DetectedPhoto({ k, locale, caption, className = '', priority = false, frame = 4 / 3 }: { k: string; locale: Locale; caption?: string; className?: string; priority?: boolean; frame?: number }) {
  const s = sample(k);
  const ratio = String(frame);
  const dets = coverBoxes(s, frame);
  return (
    <figure className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1420] ${className}`}>
      <div className="relative w-full" style={{ aspectRatio: ratio }} dir="ltr">
        <Image src={s.src} alt={caption ?? ''} fill sizes="(min-width: 1024px) 50vw, 100vw" priority={priority} className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
        <div className="absolute inset-0"><Boxes dets={dets} locale={locale} size="sm" /></div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-3 pt-10">
          {caption ? <p className="text-[14px] font-[560] text-white">{caption}</p> : null}
          <p className="mt-0.5 text-[10.5px] text-white/60"><a href={s.credit.source} target="_blank" rel="noreferrer" className="hover:text-white/90">{short(s)}</a> · {s.inference_ms} ms</p>
        </div>
      </div>
    </figure>
  );
}

export function PlainPhoto({ k, alt, className = '', ratio = '16/10' }: { k: string; alt: string; className?: string; ratio?: string }) {
  const s = sample(k);
  return (
    <figure className={`relative overflow-hidden rounded-2xl ${className}`}>
      <div className="relative w-full" style={{ aspectRatio: ratio }}>
        <Image src={s.src} alt={alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      <figcaption className="absolute bottom-2 end-3 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur"><a href={s.credit.source} target="_blank" rel="noreferrer">{short(s)}</a></figcaption>
    </figure>
  );
}

export function BrowserFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/12 bg-[#0d1726] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.7)] ${className}`}>
      <div className="flex h-8 items-center gap-1.5 border-b border-white/8 px-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto rounded bg-white/6 px-10 py-0.5 text-[10px] text-white/40">app.roadshield.ai</span>
      </div>
      <Image src={src} alt={alt} width={1920} height={1200} sizes="(min-width: 1024px) 60vw, 100vw" className="block h-auto w-full" />
    </div>
  );
}

export function PhoneFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-[2.2rem] border border-white/15 bg-[#05080d] p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ${className}`}>
      <div className="relative overflow-hidden rounded-[1.7rem] bg-[#F6F8FC] pt-7">
        <span className="absolute start-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black rtl:translate-x-1/2" />
        <Image src={src} alt={alt} width={780} height={1688} sizes="280px" className="block h-auto w-full" />
      </div>
    </div>
  );
}
