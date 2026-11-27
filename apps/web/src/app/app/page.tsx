import Link from 'next/link';
import { Route, ScanSearch, TriangleAlert, FolderKanban, ClipboardList, Wallet, Landmark, FileCheck2, BadgeCheck, Banknote, PiggyBank,
  Hourglass, Cpu, Upload, ArrowUpRight, Activity } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { money, num, relative } from '@/lib/format';
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Kpi, PageHeader, Progress, conditionColor, projectTone, TableCard } from '@/components/ui';
import { TrendChart } from '@/components/app/charts';
import { ContractorHome } from '@/components/app/ContractorHome';

export const metadata = { title: 'Overview' };

type Overview = {
  network: { road_segments: number; managed_km: number; inspected_segments: number; inspected_km: number; segments_requiring_maintenance: number;
    condition_distribution: Record<string, number>; verified_defects: number; verified_citizen_hazards: number | null; pending_inspections: number;
    active_projects: number; open_work_orders: number; members: number };
  finance: null | { currency: string; fiscal_year: number; approved_budget_fy: number; approved_budget_total: number; committed: number; verified_actual: number;
    paid: number; pending_approvals: number; maintenance_backlog: number; projects_without_estimate: number; remaining_available: number };
};

export default async function OverviewPage() {
  const { org, profile } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  if (org.role === 'contractor') return <ContractorHome />;

  const sb = await supabaseServer();
  const fin = can.readFinance(org.role);
  const [ov, trend, projects, activity, models] = await Promise.all([
    sb.rpc('org_overview', { p_org: org.org_id }),
    fin ? sb.rpc('org_spending_trend', { p_org: org.org_id, p_months: 12 }) : Promise.resolve({ data: null }),
    sb.rpc('project_list', { p_org: org.org_id }),
    org.role !== 'field_inspector' ? sb.rpc('org_activity', { p_org: org.org_id, p_limit: 8 }) : Promise.resolve({ data: [] }),
    sb.from('ml_models').select('kind, name, version, provenance, status, approved_at').eq('status', 'production'),
  ]);
  const o = ov.data as Overview | null;
  if (!o) return <EmptyState icon={TriangleAlert} title={t.errors.generic} />;
  const n = o.network; const f = o.finance; const cur = f?.currency ?? org.default_currency;
  const condKm = n.condition_distribution ?? {};
  const totalKm = Object.values(condKm).reduce((a, b) => a + Number(b), 0);
  const trendRows = ((trend.data ?? []) as { month: string; verified_actual: number; invoiced_approved: number; paid: number }[])
    .map((r) => ({ month: r.month, verified_actual: Number(r.verified_actual), invoiced_approved: Number(r.invoiced_approved), paid: Number(r.paid) }));
  const hasTrend = trendRows.some((r) => r.verified_actual || r.paid || r.invoiced_approved);
  const prj = ((projects.data ?? []) as { id: string; code: string; name: string; status: string; priority: number; road_km: number; approved_budget: number | null; verified_actual: number | null; currency: string }[])
    .filter((x) => ['planning', 'approved', 'in_progress'].includes(x.status)).slice(0, 6);
  const greeting = profile?.full_name ? profile.full_name.split(' ')[0] : '';

  return (
    <>
      <PageHeader title={greeting ? `${t.overview.title} · ${greeting}` : t.overview.title} subtitle={t.overview.subtitle}
        actions={<><ButtonLink href="/app/map" variant="secondary" size="sm">{t.nav.map}</ButtonLink>{can.engineer(org.role) ? <ButtonLink href="/app/projects/new" size="sm">{p.projects.new}</ButtonLink> : null}</>} />

      {n.road_segments === 0 ? (
        <Card className="mb-6"><EmptyState icon={Route} title={t.overview.noRoads} body={t.overview.noRoadsBody}
          action={can.engineer(org.role) ? <ButtonLink href="/app/roads/import" icon={Upload}>{t.overview.importRoads}</ButtonLink> : undefined} /></Card>
      ) : null}

      <section aria-label="Network" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi testId="kpi-managed-km" label={t.overview.managedKm} value={<>{num(n.managed_km, locale, 1)} <span className="text-base text-ink-2">{t.common.km}</span></>} hint={`${num(n.road_segments, locale)} ${p.roads.segments}`} icon={Route} />
        <Kpi label={t.overview.inspectedKm} value={<>{num(n.inspected_km, locale, 1)} <span className="text-base text-ink-2">{t.common.km}</span></>} hint={n.managed_km ? `${num((n.inspected_km / n.managed_km) * 100, locale, 0)}% · ${num(n.inspected_segments, locale)} ${p.roads.segments}` : undefined} icon={ScanSearch} tone="teal" />
        <Kpi label={t.overview.defects} value={num(n.verified_defects, locale)} hint={n.pending_inspections ? `${n.pending_inspections} ${t.common.pendingReview}` : undefined} icon={TriangleAlert} tone="amber" />
        <Kpi label={t.overview.needsMaintenance} value={num(n.segments_requiring_maintenance, locale)} icon={Activity} tone="red" />
        <Kpi label={t.overview.activeProjects} value={num(n.active_projects, locale)} icon={FolderKanban} tone="violet" />
        <Kpi label={t.overview.openWorkOrders} value={num(n.open_work_orders, locale)} icon={ClipboardList} tone="neutral" />
      </section>

      {f ? (
        <section aria-label="Finance" className="mt-4 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi testId="kpi-budget" label={`${t.money.approved_budget} · FY${f.fiscal_year}`} value={money(f.approved_budget_fy, cur, locale, { compact: true })} hint={`${t.common.total}: ${money(f.approved_budget_total, cur, locale, { compact: true })}`} icon={Landmark} />
          <Kpi label={t.money.committed} value={money(f.committed, cur, locale, { compact: true })} icon={FileCheck2} tone="blue" />
          <Kpi label={t.money.verified_actual} value={money(f.verified_actual, cur, locale, { compact: true })} icon={BadgeCheck} tone="teal" />
          <Kpi label={t.money.paid} value={money(f.paid, cur, locale, { compact: true })} icon={Banknote} tone="green" />
          <Kpi label={t.money.remaining_available} value={money(f.remaining_available, cur, locale, { compact: true })} icon={PiggyBank} tone={f.remaining_available < 0 ? 'red' : 'green'} />
          <Kpi label={t.money.backlog} value={money(f.maintenance_backlog, cur, locale, { compact: true })} hint={f.projects_without_estimate ? `+${f.projects_without_estimate} without estimate` : undefined} icon={Hourglass} tone="amber"
            footer={f.pending_approvals ? <Link href="/app/finance" className="flex items-center justify-between font-[560] text-accent-text">{f.pending_approvals} {t.money.pendingApprovals}<ArrowUpRight size={13} className="flip-rtl" /></Link> : undefined} />
        </section>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-3 text-xs text-ink-2"><Wallet size={13} className="me-1.5 inline" />{t.overview.financeHidden}</p>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {f ? (
          <Card>
            <CardHeader title={t.overview.spendingTrend} subtitle={cur} />
            {hasTrend ? (
              <>
                <TrendChart locale={locale} currency={cur} data={trendRows} series={[
                  { key: 'verified_actual', label: t.money.verified_actual, color: 'var(--viz-1)' },
                  { key: 'invoiced_approved', label: t.money.invoiced_approved, color: 'var(--viz-2)' },
                  { key: 'paid', label: t.money.paid, color: 'var(--viz-3)' }]} />
                <details className="mt-3 text-xs text-ink-2"><summary className="cursor-pointer">Table</summary>
                  <div className="mt-2 overflow-x-auto"><table className="table"><thead><tr><th>Month</th><th className="num">{t.money.verified_actual}</th><th className="num">{t.money.invoiced_approved}</th><th className="num">{t.money.paid}</th></tr></thead>
                    <tbody>{trendRows.map((r) => <tr key={r.month}><td>{r.month}</td><td className="num">{money(r.verified_actual, cur, locale)}</td><td className="num">{money(r.invoiced_approved, cur, locale)}</td><td className="num">{money(r.paid, cur, locale)}</td></tr>)}</tbody></table></div>
                </details>
              </>
            ) : <EmptyState compact icon={Wallet} title={t.empty.trend} />}
          </Card>
        ) : null}
        <Card className={f ? '' : 'xl:col-span-2'}>
          <CardHeader title={t.overview.conditionMix} subtitle={`${num(totalKm, locale, 1)} ${t.common.km}`} />
          {totalKm > 0 ? (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t.overview.conditionMix}>
                {(['good', 'fair', 'poor', 'critical', 'unknown'] as const).map((c) => Number(condKm[c] ?? 0) > 0 ? (
                  <div key={c} style={{ width: `${(Number(condKm[c]) / totalKm) * 100}%`, background: conditionColor[c] }} className="first:rounded-s-full last:rounded-e-full" title={`${t.condition[c]}: ${num(condKm[c], locale, 1)} km`} />
                ) : null)}
              </div>
              <ul className="mt-5 space-y-2.5">
                {(['good', 'fair', 'poor', 'critical', 'unknown'] as const).map((c) => (
                  <li key={c} className="flex items-center gap-3 text-sm">
                    <span className="size-2.5 rounded-full" style={{ background: conditionColor[c] }} />
                    <span className="flex-1 text-ink">{t.condition[c]}</span>
                    <span className="tabular text-ink">{num(condKm[c] ?? 0, locale, 1)} {t.common.km}</span>
                    <span className="w-12 text-end tabular text-xs text-ink-2">{num((Number(condKm[c] ?? 0) / totalKm) * 100, locale, 0)}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-3">{t.condition.unknown}: {p.roads.unknownNote.split('.')[0]}.</p>
            </>
          ) : <EmptyState compact icon={Route} title={t.overview.noRoads} />}
          <div className="mt-5 border-t border-line pt-4 text-sm">
            <span className="text-ink-2">{t.overview.citizenHazards}: </span>
            {n.verified_citizen_hazards === null ? <span className="text-ink-3">{t.overview.setServiceArea}</span> : <span className="font-[600] tabular">{num(n.verified_citizen_hazards, locale)}</span>}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <TableCard title={t.overview.priorityProjects} action={<Link href="/app/projects" className="text-[13px] font-[560] text-accent-text">{t.common.view}</Link>}>
          {prj.length ? (
            <table className="table">
              <thead><tr><th>{t.common.code}</th><th>{t.common.name}</th><th>{t.common.status}</th><th className="num">{p.projects.km}</th>{f ? <th className="w-48">{t.money.utilization}</th> : null}</tr></thead>
              <tbody>
                {prj.map((x) => {
                  const util = x.approved_budget ? (Number(x.verified_actual ?? 0) / Number(x.approved_budget)) * 100 : 0;
                  return (
                    <tr key={x.id}>
                      <td className="font-mono text-xs"><Link href={`/app/projects/${x.id}`} className="text-accent-text hover:underline">{x.code}</Link></td>
                      <td className="max-w-64 truncate">{x.name}</td>
                      <td><Badge tone={projectTone(x.status)} dot>{t.projectStatus[x.status as keyof typeof t.projectStatus]}</Badge></td>
                      <td className="num">{num(x.road_km, locale, 2)}</td>
                      {f ? <td>{x.approved_budget ? <div className="flex items-center gap-2"><Progress value={util} tone={util > 100 ? 'red' : 'blue'} /><span className="w-10 text-end text-xs tabular text-ink-2">{num(util, locale, 0)}%</span></div> : <span className="text-xs text-ink-3">{p.projects.noBudget}</span>}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <EmptyState compact icon={FolderKanban} title={t.empty.projects} body={t.empty.projectsBody} />}
        </TableCard>
        <div className="grid gap-5">
          <Card>
            <CardHeader title={t.overview.aiStatus} icon={Cpu} />
            <ul className="space-y-3">
              {((models.data ?? []) as { kind: string; name: string; version: string; provenance: string }[]).map((m) => (
                <li key={m.kind} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-[560]">{m.name}</p><p className="truncate font-mono text-[11px] text-ink-2">{m.version}</p></div>
                  <Badge tone={m.provenance === 'third_party_pretrained' ? 'amber' : 'green'}>{p.models.provenance[m.provenance as keyof typeof p.models.provenance]}</Badge>
                </li>
              ))}
              {!(models.data ?? []).length ? <li className="text-sm text-ink-2">{t.empty.models}</li> : null}
            </ul>
            <Link href="/app/model-center" className="mt-4 inline-flex text-[13px] font-[560] text-accent-text">{t.nav.modelCenter}</Link>
          </Card>
          {org.role !== 'field_inspector' ? (
            <Card>
              <CardHeader title={t.overview.activity} />
              {((activity.data ?? []) as { id: number; action: string; actor_name: string | null; created_at: string }[]).length ? (
                <ol className="space-y-3">
                  {((activity.data ?? []) as { id: number; action: string; actor_name: string | null; created_at: string }[]).map((a) => (
                    <li key={a.id} className="flex gap-3 text-[13px]">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      <div className="min-w-0 flex-1"><p className="truncate"><span className="font-[560]">{a.actor_name || '—'}</span> · <span className="font-mono text-xs text-ink-2">{a.action}</span></p></div>
                      <span className="shrink-0 text-xs text-ink-3">{relative(a.created_at, locale)}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-ink-2">{t.empty.activity}</p>}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
