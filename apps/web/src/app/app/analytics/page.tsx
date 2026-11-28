import { BarChart3 } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { num } from '@/lib/format';
import { Card, CardHeader, EmptyState, PageHeader, conditionColor } from '@/components/ui';
import { HBarChart } from '@/components/app/charts';

export const metadata = { title: 'Advanced Analytics' };
type A = { condition_by_class: { highway_class: string; condition: string; km: number }[]; defects_by_class: { defect_class: string; n: number; area_m2: number }[];
  defects_by_severity: Record<string, number>; inspections_by_month: { month: string; n: number }[]; work_orders_by_status: Record<string, number> };

export default async function Analytics() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data } = await sb.rpc('org_analytics', { p_org: org.org_id });
  const a = data as A | null;
  if (!a) return <EmptyState icon={BarChart3} title={t.errors.generic} />;
  const classes = [...new Set(a.condition_by_class.map((x) => x.highway_class))];
  const conds = ['good', 'fair', 'poor', 'critical', 'unknown'] as const;
  return (
    <>
      <PageHeader title={p.analytics.title} subtitle={p.analytics.subtitle} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={p.analytics.byClass} />
          {classes.length ? (
            <>
              <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-2">{conds.map((c) => <span key={c} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: conditionColor[c] }} />{t.condition[c]}</span>)}</div>
              <ul className="space-y-2.5">{classes.map((cl) => {
                const parts = a.condition_by_class.filter((x) => x.highway_class === cl); const tot = parts.reduce((s, x) => s + Number(x.km), 0);
                return (
                  <li key={cl} className="grid grid-cols-[110px_1fr_64px] items-center gap-3 text-sm">
                    <span className="truncate font-mono text-xs text-ink-2">{cl}</span>
                    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-sunken">{conds.map((c) => { const k = Number(parts.find((x) => x.condition === c)?.km ?? 0); return k ? <div key={c} title={`${t.condition[c]}: ${k} km`} style={{ width: `${(k / tot) * 100}%`, background: conditionColor[c] }} /> : null; })}</div>
                    <span className="text-end tabular">{num(tot, locale, 1)} km</span>
                  </li>
                );
              })}</ul>
            </>
          ) : <EmptyState compact icon={BarChart3} title={t.overview.noRoads} />}
        </Card>
        <Card>
          <CardHeader title={p.analytics.defectsByClass} />
          {a.defects_by_class.length ? <HBarChart locale={locale} data={a.defects_by_class.map((d) => ({ label: t.defect[d.defect_class as keyof typeof t.defect], value: Number(d.n) }))} /> : <EmptyState compact icon={BarChart3} title={t.common.none} />}
        </Card>
        <Card>
          <CardHeader title={p.analytics.severity} />
          {Object.keys(a.defects_by_severity).length ? <HBarChart locale={locale} data={(['critical', 'high', 'medium', 'low'] as const).map((s) => ({ label: t.severity[s], value: Number(a.defects_by_severity[s] ?? 0), color: s === 'critical' || s === 'high' ? '#E5484D' : s === 'medium' ? '#F5A524' : '#8D99AB' }))} /> : <EmptyState compact icon={BarChart3} title={t.common.none} />}
        </Card>
        <Card>
          <CardHeader title={p.analytics.woStatus} />
          {Object.keys(a.work_orders_by_status).length ? <HBarChart locale={locale} data={Object.entries(a.work_orders_by_status).map(([k, v]) => ({ label: t.woStatus[k as keyof typeof t.woStatus], value: Number(v) }))} /> : <EmptyState compact icon={BarChart3} title={t.empty.workOrders} />}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title={p.analytics.throughput} />
          {a.inspections_by_month.length ? <HBarChart locale={locale} color="var(--viz-2)" data={a.inspections_by_month.map((m) => ({ label: m.month, value: Number(m.n) }))} /> : <EmptyState compact icon={BarChart3} title={t.empty.inspections} />}
        </Card>
      </div>
    </>
  );
}
