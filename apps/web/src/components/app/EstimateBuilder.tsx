'use client';
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

type Rate = { id: string; category: string; description: string; unit: string; rate: number; currency: string; source_title: string };
type Line = { category: string; description: string; unit: string; quantity: string; unit_rate_id: string; unit_rate: string; rate_source: string };
const blank = (): Line => ({ category: 'asphalt', description: '', unit: 'm2', quantity: '', unit_rate_id: '', unit_rate: '', rate_source: '' });

// Builds the p_lines JSON for submit_estimate. The preview total is display-only; the database
// recomputes every line (quantity × rate, rounded to cents) and the total with exact numerics.
export function EstimateBuilder({ currency, rates, labels, categories, locale }: { currency: string; rates: Rate[]; categories: Record<string, string>; locale: 'en' | 'ar';
  labels: { category: string; qty: string; unit: string; rate: string; source: string; useRate: string; manual: string; add: string; total: string; desc: string } }) {
  const [lines, setLines] = useState<Line[]>([blank()]);
  const usable = rates.filter((r) => r.currency === currency);
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const payload = useMemo(() => JSON.stringify(lines.filter((l) => l.quantity).map((l) => l.unit_rate_id
    ? { category: l.category, quantity: l.quantity, unit_rate_id: l.unit_rate_id, description: l.description || undefined }
    : { category: l.category, description: l.description, unit: l.unit, quantity: l.quantity, unit_rate: l.unit_rate, rate_source: l.rate_source })), [lines]);
  const preview = lines.reduce((a, l) => {
    const r = l.unit_rate_id ? usable.find((x) => x.id === l.unit_rate_id)?.rate : Number(l.unit_rate);
    return a + (Number(l.quantity) || 0) * (Number(r) || 0);
  }, 0);
  return (
    <div className="space-y-3">
      <input type="hidden" name="p_lines" value={payload} />
      {lines.map((l, i) => (
        <div key={i} className="rounded-xl border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select className="select" value={l.category} onChange={(e) => set(i, { category: e.target.value })} aria-label={labels.category}>
              {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="input tabular" placeholder={labels.qty} value={l.quantity} inputMode="decimal" onChange={(e) => set(i, { quantity: e.target.value })} aria-label={labels.qty} />
            <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line" disabled={lines.length === 1}><Trash2 size={15} /></button>
          </div>
          <select className="select mt-2" value={l.unit_rate_id} onChange={(e) => set(i, { unit_rate_id: e.target.value })} aria-label={labels.useRate}>
            <option value="">{labels.manual}</option>
            {usable.filter((r) => r.category === l.category).map((r) => <option key={r.id} value={r.id}>{r.description} · {r.rate} {r.currency}/{r.unit} · {r.source_title}</option>)}
          </select>
          {!l.unit_rate_id ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <input className="input" placeholder={labels.desc} value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
              <input className="input" placeholder={labels.unit} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
              <input className="input tabular" placeholder={`${labels.rate} (${currency})`} inputMode="decimal" value={l.unit_rate} onChange={(e) => set(i, { unit_rate: e.target.value })} />
              <input className="input sm:col-span-3" placeholder={labels.source} value={l.rate_source} onChange={(e) => set(i, { rate_source: e.target.value })} />
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setLines([...lines, blank()])}><Plus size={14} />{labels.add}</button>
        <span className="text-sm text-ink-2">{labels.total} ≈ <span className="font-[620] text-ink tabular">{new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { style: 'currency', currency, currencyDisplay: 'code' }).format(preview)}</span></span>
      </div>
    </div>
  );
}
