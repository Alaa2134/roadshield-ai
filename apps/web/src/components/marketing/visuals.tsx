// Original, illustrative product visuals for the public website. They depict the interface
// and concepts only: no numbers, statistics or customer data are shown.
import { LogoMark } from '@/components/brand/Logo';

const roads = [
  { d: 'M-20 250 C 120 240, 220 200, 330 205 S 560 240, 720 220', c: '#12A879', w: 5 },
  { d: 'M120 -10 C 140 90, 170 170, 210 230 S 260 360, 250 420', c: '#F5A524', w: 4 },
  { d: 'M380 -10 C 370 100, 360 160, 380 230 S 430 330, 470 420', c: '#00B8A9', w: 4 },
  { d: 'M-10 120 C 100 130, 260 110, 380 120 S 600 90, 720 110', c: '#E5484D', w: 4 },
  { d: 'M560 -10 C 540 80, 560 170, 590 230 S 640 330, 650 420', c: '#12A879', w: 3 },
  { d: 'M-10 340 C 150 330, 300 350, 470 335 S 650 320, 720 330', c: '#8D99AB', w: 3 },
  { d: 'M260 120 L 300 205', c: '#00B8A9', w: 2.5 },
  { d: 'M470 120 L 520 230', c: '#F5A524', w: 2.5 },
];

function MapArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 700 410" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="700" height="410" fill="#0B1A2F" />
      <g opacity=".5">
        {Array.from({ length: 16 }).map((_, i) => <path key={i} d={`M${i * 48} 0 V410`} stroke="#13284A" strokeWidth="1" />)}
        {Array.from({ length: 9 }).map((_, i) => <path key={i} d={`M0 ${i * 48} H700`} stroke="#13284A" strokeWidth="1" />)}
      </g>
      <path d="M430 300 C 470 270, 560 260, 620 300 S 640 380, 560 395 S 420 360, 430 300Z" fill="#2878FF" fillOpacity=".08" stroke="#2878FF" strokeOpacity=".5" strokeDasharray="5 5" />
      {roads.map((r, i) => (
        <g key={i}>
          <path d={r.d} stroke="#071629" strokeWidth={r.w + 4} fill="none" strokeLinecap="round" />
          <path d={r.d} stroke={r.c} strokeWidth={r.w} fill="none" strokeLinecap="round" />
        </g>
      ))}
      {[[212, 232, '#E5484D'], [330, 205, '#F5A524'], [120, 126, '#E5484D'], [590, 232, '#F5A524'], [470, 336, '#00B8A9']].map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="11" fill={c as string} fillOpacity=".2" />
          <circle r="5.5" fill={c as string} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

const Bar = ({ w, className = '' }: { w: string; className?: string }) => <div className={`h-2 rounded-full bg-white/10 ${className}`} style={{ width: w }} />;

export function ProductShowcase({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="absolute -inset-x-10 -top-10 bottom-0 rounded-[40px] bg-[radial-gradient(50%_60%_at_50%_30%,rgba(40,120,255,0.35),transparent_70%)] blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[18px] border border-white/12 bg-[#0A1729] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]" role="img" aria-label={label}>
        <div className="flex h-9 items-center gap-2 border-b border-white/8 px-4">
          <span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" />
          <div className="mx-auto h-5 w-56 rounded-md bg-white/6" />
        </div>
        <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[168px_1fr]">
          <aside className="border-e border-white/8 bg-[#06101F] p-3">
            <div className="mb-5 flex items-center gap-2"><LogoMark size={22} /><Bar w="60%" className="hidden sm:block" /></div>
            {[1, 0, 0, 0, 0, 0, 0].map((a, i) => (
              <div key={i} className={`mb-1.5 flex items-center gap-2 rounded-lg px-2 py-2 ${a ? 'bg-cyan/12' : ''}`}>
                <span className={`size-3.5 shrink-0 rounded ${a ? 'bg-cyan' : 'bg-white/15'}`} />
                <Bar w={`${50 + ((i * 17) % 40)}%`} className={`hidden sm:block ${a ? '!bg-cyan/50' : ''}`} />
              </div>
            ))}
          </aside>
          <div className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {['#2878FF', '#00B8A9', '#F5A524', '#12A879'].map((c) => (
                <div key={c} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <Bar w="55%" />
                  <div className="mt-3 h-4 w-3/4 rounded-md" style={{ background: `${c}55` }} />
                  <div className="mt-3 flex h-6 items-end gap-0.5">
                    {[4, 6, 5, 8, 7, 9, 11, 10].map((h, i) => <span key={i} className="flex-1 rounded-sm" style={{ height: `${h * 8}%`, background: `${c}88` }} />)}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_210px]">
              <div className="relative h-[230px] overflow-hidden rounded-xl border border-white/8 sm:h-[290px]">
                <MapArt className="absolute inset-0 h-full w-full" />
                <div className="absolute start-3 top-3 flex gap-1.5">
                  {['#12A879', '#00B8A9', '#F5A524', '#E5484D'].map((c) => <span key={c} className="h-5 w-12 rounded-full border border-white/10 bg-[#071629]/80" style={{ boxShadow: `inset 3px 0 0 ${c}` }} />)}
                </div>
              </div>
              <div className="hidden rounded-xl border border-white/8 bg-white/[0.03] p-3 lg:block">
                <div className="mb-3 flex items-center justify-between"><Bar w="55%" /><span className="h-4 w-12 rounded-full bg-[#F5A524]/30" /></div>
                <Bar w="80%" /><Bar w="40%" className="mt-2" />
                <div className="my-4 h-px bg-white/8" />
                {[70, 45, 85, 30].map((w, i) => (
                  <div key={i} className="mb-3">
                    <Bar w="35%" />
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-brand to-teal" style={{ width: `${w}%` }} /></div>
                  </div>
                ))}
                <div className="mt-4 grid grid-cols-3 gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 rounded-lg bg-white/6" />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-[#7F8EA5]">{label}</p>
    </div>
  );
}

export function VisionVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-navy shadow-float" role="img" aria-label="Detection boxes on a road photo illustration">
      <svg viewBox="0 0 560 380" className="block h-auto w-full" aria-hidden="true">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#1B3354" /><stop offset="1" stopColor="#2B4A6E" /></linearGradient>
          <linearGradient id="asph" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3B4452" /><stop offset="1" stopColor="#262C36" /></linearGradient>
        </defs>
        <rect width="560" height="160" fill="url(#sky)" />
        <rect y="150" width="560" height="230" fill="#33503B" />
        <path d="M250 150 H310 L560 380 H0 Z" fill="url(#asph)" />
        <path d="M280 160 V180 M280 200 V228 M280 252 V292 M280 320 V375" stroke="#E9E2C8" strokeWidth="4" strokeDasharray="0" opacity=".8" />
        <path d="M120 300 l18 -8 l10 6 l16 -10 l12 4 l14 -9 m-60 12 l8 10 m20 -16 l4 12 m18 -10 l6 10" stroke="#151A21" strokeWidth="2.5" fill="none" />
        <path d="M150 312 l12 -6 l14 8 l10 -6 l16 4 l10 -8" stroke="#151A21" strokeWidth="2" fill="none" />
        <path d="M352 250 C 356 270, 352 290, 362 318 S 372 350, 368 372" stroke="#151A21" strokeWidth="2.5" fill="none" />
        <ellipse cx="410" cy="318" rx="34" ry="12" fill="#14181E" /><ellipse cx="410" cy="316" rx="28" ry="8" fill="#0E1116" />
        <g fill="none" strokeWidth="2.5">
          <rect x="104" y="276" width="104" height="54" rx="4" stroke="#F5A524" />
          <rect x="336" y="240" width="48" height="136" rx="4" stroke="#51C7F5" />
          <rect x="368" y="296" width="86" height="40" rx="4" stroke="#E5484D" />
        </g>
        {[[104, 270, '#F5A524', 'D20 Alligator crack'], [336, 234, '#51C7F5', 'D00 Longitudinal'], [368, 290, '#E5484D', 'D40 Pothole']].map(([x, y, c, t]) => (
          <g key={t as string} transform={`translate(${x} ${(y as number) - 20})`}>
            <rect width={(t as string).length * 6.6 + 14} height="18" rx="4" fill={c as string} />
            <text x="7" y="13" fontSize="11" fontWeight="600" fill="#071629" fontFamily="Inter, sans-serif">{t as string}</text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between rounded-xl border border-white/10 bg-[#071629]/85 px-3 py-2 text-xs text-[#C3CFDF] backdrop-blur">
        <span className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-cyan" />RoadShield Vision</span>
        <span className="rounded-md bg-white/8 px-2 py-0.5">Review required</span>
      </div>
    </div>
  );
}

export function FinanceVisual({ labels }: { labels: { k: string; v: string }[] }) {
  const widths = ['100%', '78%', '56%', '52%', '44%'];
  const colors = ['#2878FF', '#51C7F5', '#00B8A9', '#12A879', '#0B7F5B'];
  return (
    <div className="card overflow-hidden p-6 shadow-float" role="img" aria-label="Separate financial quantities illustration">
      <div className="space-y-4">
        {labels.map((l, i) => (
          <div key={l.k}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-sm font-[600] text-ink">{l.k}</span>
              <span className="truncate text-xs text-ink-2">{l.v}</span>
            </div>
            <div className="h-3 rounded-full bg-sunken"><div className="h-full rounded-full" style={{ width: widths[i], background: colors[i] }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PredictVisual() {
  return (
    <div className="card p-6 shadow-float" role="img" aria-label="Cost range with comparable projects illustration">
      <svg viewBox="0 0 440 200" className="block h-auto w-full" aria-hidden="true">
        <path d="M20 170 H420" stroke="var(--rs-border-strong)" />
        <rect x="140" y="70" width="150" height="70" rx="10" fill="var(--rs-accent-soft)" stroke="var(--rs-accent)" strokeOpacity=".4" />
        <path d="M215 60 V150" stroke="var(--rs-accent)" strokeWidth="3" strokeLinecap="round" />
        {[[60, 120], [110, 95], [165, 110], [190, 85], [240, 100], [265, 120], [320, 90], [380, 105]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6" fill="var(--rs-teal)" fillOpacity=".85" stroke="var(--rs-surface)" strokeWidth="2" />
        ))}
        <path d="M140 160 H290" stroke="var(--rs-text-3)" strokeDasharray="3 4" />
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="badge bg-accent-soft text-accent-text">P25–P75</span>
        <span className="badge bg-teal-soft text-teal-text">Comparables</span>
        <span className="badge bg-sunken text-ink-2">Model version</span>
        <span className="badge bg-warn-soft text-warn-text">Assumptions</span>
      </div>
    </div>
  );
}

export function SecurityVisual() {
  const rings = ['Audit log', 'Four-eyes approvals', 'Row-level security', 'Signed storage URLs'];
  return (
    <div className="relative grid aspect-square max-w-md place-items-center" role="img" aria-label="Security layers illustration">
      {rings.map((r, i) => (
        <div key={r} className="absolute rounded-full border border-accent/25" style={{ inset: `${i * 12}%`, background: `rgba(40,120,255,${0.03 + i * 0.03})` }}>
          <span className="absolute start-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-[560] whitespace-nowrap text-ink shadow-soft rtl:translate-x-1/2">{r}</span>
        </div>
      ))}
      <LogoMark size={64} />
    </div>
  );
}

export function WorkflowVisual({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {steps.map((s, i) => (
        <li key={s.title} className="card card-pad relative">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-[650] text-white">{i + 1}</span>
          <h3 className="t-card mt-3">{s.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export { MapArt };
