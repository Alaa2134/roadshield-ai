'use client';
import { useState, useTransition } from 'react';
import { X, Search } from 'lucide-react';
import { searchRoadsAction } from '@/lib/actions/search';

type Road = { id: string; name: string | null; highway_class: string; length_m: number };
export function RoadPicker({ orgId, label, placeholder, initial }: { orgId: string; label: string; placeholder: string; initial: Road[] }) {
  const [picked, setPicked] = useState<Road[]>(initial);
  const [results, setResults] = useState<Road[]>([]);
  const [, start] = useTransition();
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-[560]">{label}</p>
      {picked.map((r) => <input key={r.id} type="hidden" name="p_road_ids" value={r.id} />)}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {picked.map((r) => (
          <span key={r.id} className="badge h-7 border border-line bg-surface ps-2.5 text-ink">
            {r.name ?? r.highway_class} · {(r.length_m / 1000).toFixed(2)} km
            <button type="button" aria-label="Remove" onClick={() => setPicked(picked.filter((x) => x.id !== r.id))} className="text-ink-3 hover:text-crit"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="input ps-9" placeholder={placeholder} onChange={(e) => { const q = e.target.value; start(async () => setResults(await searchRoadsAction(orgId, q))); }} data-testid="road-search" />
      </div>
      {results.length ? (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-card">
          {results.filter((r) => !picked.some((p) => p.id === r.id)).map((r) => (
            <li key={r.id}><button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm hover:bg-hover" onClick={() => { setPicked([...picked, r]); }}>
              <span className="truncate">{r.name ?? '—'}</span><span className="font-mono text-xs text-ink-3">{r.highway_class} · {(r.length_m / 1000).toFixed(2)} km</span></button></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
