'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { TrendChart } from './charts';
import { getMonthRecords, type MonthRecords } from '@/lib/actions/finance';
import type { Locale } from '@/lib/i18n/dict';

type Row = { month: string; verified_actual: number; invoiced_approved: number; paid: number };
type L = { verified: string; invoiced: string; paid: string; period: string; months: string; click: string; costs: string; invoices: string; payments: string; none: string; close: string; empty: string };

/** Spending trend with a period filter and click-to-drill-down into the exact records of a month. */
export function SpendingExplorer({ org, rows, months, currency, locale, labels }: { org: string; rows: Row[]; months: number; currency: string; locale: Locale; labels: L }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<MonthRecords | null>(null);
  const [pending, start] = useTransition();
  const fmt = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { style: 'currency', currency, currencyDisplay: 'code' }).format(v);
  const pick = (m: string) => { setSel(m); start(async () => { const r = await getMonthRecords(org, m); setData('error' in r ? null : r); }); };
  const setMonths = (n: number) => { const q = new URLSearchParams(sp.toString()); q.set('months', String(n)); router.push(`?${q.toString()}`, { scroll: false }); setSel(null); setData(null); };
  const has = rows.some((r) => r.verified_actual || r.invoiced_approved || r.paid);
  const total = (a: { amount: number }[]) => a.reduce((s, x) => s + Number(x.amount), 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label={labels.period}>
          {[3, 6, 12, 24].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={months === n} onClick={() => setMonths(n)}
              className={`rounded-md px-2.5 py-1 text-[12px] tabular ${months === n ? 'bg-surface font-[600] text-ink shadow-soft' : 'text-ink-2 hover:text-ink'}`}>{n} {labels.months}</button>
          ))}
        </div>
        {has ? <p className="text-xs text-ink-3">{labels.click}</p> : null}
      </div>
      {has ? (
        <TrendChart locale={locale} currency={currency} data={rows} selected={sel} onSelect={pick} series={[
          { key: 'verified_actual', label: labels.verified, color: 'var(--viz-1)' },
          { key: 'invoiced_approved', label: labels.invoiced, color: 'var(--viz-2)' },
          { key: 'paid', label: labels.paid, color: 'var(--viz-3)' }]} />
      ) : <p className="py-10 text-center text-sm text-ink-2">{labels.empty}</p>}
      {sel ? (
        <div className="mt-4 rounded-xl border border-line bg-bg p-4 fade-up" aria-live="polite" data-testid="month-records">
          <div className="mb-3 flex items-center justify-between">
            <p className="t-card tabular">{sel}</p>
            <button type="button" onClick={() => { setSel(null); setData(null); }} className="btn btn-sm btn-ghost px-1.5" aria-label={labels.close}><X size={15} /></button>
          </div>
          {pending || !data ? <p className="flex items-center gap-2 text-sm text-ink-2"><Loader2 size={14} className="animate-spin" />…</p> : (
            <div className="grid gap-4 md:grid-cols-3">
              {([['costs', data.cost_items], ['invoices', data.invoices], ['payments', data.payments]] as const).map(([k, list]) => (
                <div key={k}>
                  <p className="mb-1.5 flex justify-between text-xs font-[600] text-ink-2"><span>{labels[k]}</span><span className="tabular">{fmt(total(list))}</span></p>
                  {list.length ? (
                    <ul className="space-y-1">
                      {list.map((r) => (
                        <li key={r.id}><Link href={`/app/projects/${r.project_id}?tab=${k === 'costs' ? 'costs' : 'invoices'}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-hover">
                          <span className="min-w-0 truncate"><span className="font-mono text-[11px] text-accent-text">{r.project_code}</span> · {'description' in r ? r.description : 'number' in r ? r.number : r.reference}</span>
                          <span className="shrink-0 tabular">{fmt(Number(r.amount))}</span></Link></li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-ink-3">{labels.none}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
