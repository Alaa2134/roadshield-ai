'use client';
import { useActionState } from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import { runScenario, type StudioState } from '@/lib/actions/studio';
import { SubmitButton } from '@/components/ui/client';

type L = { funding: string; strategy: string; run: string; save: string; strategies: Record<string, string>; selected: string; notFunded: string; excluded: string;
  allocated: string; unallocated: string; candidates: string; coverage: string; safety: string; cost: string; reasonNoEst: string; reasonCur: string; km: string; review: string };

export function Studio({ org, currency, locale, labels, errors }: { org: string; currency: string; locale: 'en' | 'ar'; labels: L; errors: Record<string, string> }) {
  const [state, action] = useActionState<StudioState, FormData>(runScenario, null);
  const fmt = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(v);
  const r = state?.result;
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <form action={action} className="card card-pad h-fit space-y-4" data-testid="studio-form">
        <input type="hidden" name="org" value={org} />
        <label className="block"><span className="mb-1.5 block text-[13px] font-[560]">{labels.funding} ({currency})</span><input name="funding" className="input tabular" required inputMode="decimal" key={r?.total_funding ?? 'empty'} defaultValue={r?.total_funding ?? ''} /></label>
        <fieldset>
          <legend className="mb-2 text-[13px] font-[560]">{labels.strategy}</legend>
          <div className="grid gap-2">
            {Object.entries(labels.strategies).map(([k, v], i) => (
              <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name="strategy" value={k} defaultChecked={i === 0} className="accent-[var(--rs-accent)]" />{v}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block"><span className="mb-1.5 block text-[13px] font-[560]">{labels.save}</span><input name="save" className="input" placeholder="—" /></label>
        <SubmitButton className="w-full" testId="studio-run"><Play size={15} />{labels.run}</SubmitButton>
        {state?.error ? <p className="flex items-start gap-2 rounded-lg bg-crit-soft px-3 py-2 text-[13px] text-crit-text" role="alert"><AlertTriangle size={15} className="mt-0.5" />{errors[state.error] ?? errors.generic}</p> : null}
      </form>
      <div className="grid content-start gap-5" aria-live="polite">
        {r ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="studio-result">
              {[[labels.allocated, fmt(r.allocated)], [labels.unallocated, fmt(r.unallocated)], [labels.coverage, `${r.totals.road_km} ${labels.km}`], [labels.candidates, String(r.candidates)]].map(([k, v]) => (
                <div key={k} className="card card-pad"><p className="t-label">{k}</p><p className="t-metric mt-2">{v}</p></div>
              ))}
            </div>
            <div className="card card-pad">
              <div className="mb-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-sunken">
                {r.selected.map((s, i) => <div key={s.project_id} title={`${s.code}: ${fmt(s.cost)}`} style={{ width: `${(s.cost / r.total_funding) * 100}%`, background: ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'][i % 3] }} />)}
              </div>
              <p className="text-xs text-ink-2">{r.method}</p>
            </div>
            <section className="card overflow-hidden">
              <h3 className="border-b border-line px-5 py-3 t-card">{labels.selected} · {r.selected.length}</h3>
              <table className="table"><thead><tr><th>#</th><th>Code</th><th>Name</th><th className="num">{labels.cost}</th><th className="num">{labels.coverage}</th><th className="num">{labels.safety}</th></tr></thead>
                <tbody>{r.selected.map((s, i) => <tr key={s.project_id}><td className="tabular text-ink-3">{i + 1}</td><td className="font-mono text-xs"><a className="text-accent-text hover:underline" href={`/app/projects/${s.project_id}`}>{s.code}</a></td><td className="max-w-56 truncate">{s.name}</td><td className="num">{fmt(s.cost)}</td><td className="num">{s.road_km} {labels.km}</td><td className="num">{s.safety_score}</td></tr>)}</tbody></table>
            </section>
            {r.not_funded.length || r.excluded.length ? (
              <section className="card card-pad text-sm">
                {r.not_funded.length ? <><h3 className="t-card mb-2">{labels.notFunded}</h3><ul className="mb-4 space-y-1">{r.not_funded.map((s) => <li key={s.project_id} className="flex justify-between"><span><span className="font-mono text-xs">{s.code}</span> {s.name}</span><span className="tabular">{fmt(s.cost)}</span></li>)}</ul></> : null}
                {r.excluded.length ? <><h3 className="t-card mb-2">{labels.excluded}</h3><ul className="space-y-1 text-ink-2">{r.excluded.map((s) => <li key={s.project_id}><span className="font-mono text-xs">{s.code}</span> {s.name} — {s.reason === 'no_approved_estimate' ? labels.reasonNoEst : labels.reasonCur}</li>)}</ul></> : null}
              </section>
            ) : null}
            <p className="text-xs text-ink-3">{labels.review}</p>
          </>
        ) : (
          <div className="card grid min-h-80 place-items-center p-10 text-center text-sm text-ink-2"><div><Play size={28} className="mx-auto mb-3 text-accent" />{labels.review}</div></div>
        )}
      </div>
    </div>
  );
}
