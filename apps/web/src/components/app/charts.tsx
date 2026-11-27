'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Locale } from '@/lib/i18n/dict';

const fmt = (locale: Locale, currency?: string, compact = true) => (v: number) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', currency
    ? { style: 'currency', currency, currencyDisplay: 'code', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }
    : { notation: compact ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);

function TipBox({ active, payload, label, locale, currency, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; locale: Locale; currency?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-float">
      <p className="mb-1 font-[600] text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}
          <span className="ms-auto ps-4 font-[600] text-ink tabular">{fmt(locale, currency, false)(p.value)}{unit ? ` ${unit}` : ''}</span>
        </p>
      ))}
    </div>
  );
}

export type Series = { key: string; label: string; color: string };

export function TrendChart({ data, series, locale, currency, height = 240 }: { data: Record<string, number | string>[]; series: Series[]; locale: Locale; currency: string; height?: number }) {
  const rtl = locale === 'ar';
  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2" aria-hidden>
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.18} /><stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--rs-text-3)' }} reversed={rtl} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: 'var(--rs-text-3)' }} tickFormatter={fmt(locale, currency)} orientation={rtl ? 'right' : 'left'} />
            <Tooltip content={<TipBox locale={locale} currency={currency} />} cursor={{ stroke: 'var(--rs-border-strong)' }} />
            {series.map((s) => <Area key={s.key} isAnimationActive={false} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--rs-surface)' }} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function HBarChart({ data, locale, currency, unit, color = 'var(--viz-1)', height }: { data: { label: string; value: number; color?: string }[]; locale: Locale; currency?: string; unit?: string; color?: string; height?: number }) {
  const rtl = locale === 'ar';
  return (
    <div style={{ height: height ?? Math.max(120, data.length * 34 + 16) }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--rs-text-3)' }} tickFormatter={fmt(locale, currency)} reversed={rtl} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={130} tick={{ fontSize: 12, fill: 'var(--rs-text-2)' }} orientation={rtl ? 'right' : 'left'} />
          <Tooltip content={<TipBox locale={locale} currency={currency} unit={unit} />} cursor={{ fill: 'var(--rs-surface-hover)' }} />
          <Bar dataKey="value" name={unit ?? ''} radius={4} maxBarSize={18} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.label} fill={d.color ?? color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
