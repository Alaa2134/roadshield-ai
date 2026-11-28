import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Landmark, Calculator, FileCheck2, Receipt, BadgeCheck, Banknote, PiggyBank, TrendingUp, Info, FolderKanban, Sparkles, History, CircleOff } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money, num } from '@/lib/format';
import { Badge, Card, CardHeader, DefinitionList, EmptyState, Field, Kpi, Notice, PageHeader, Progress, TableCard, Tabs, approvalTone, projectTone, woTone } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm, ReviewButtons } from '@/components/app/RpcForm';
import { HBarChart, TrendChart } from '@/components/app/charts';
import { EstimateBuilder } from '@/components/app/EstimateBuilder';

type Fin = { currency: string; approved_budget: number; pending_budget: number; approved_estimate: number | null; estimate_version: number | null; committed: number;
  invoiced_approved: number; invoiced_pending: number; verified_actual: number; pending_actual: number; paid: number; remaining_available: number;
  budget_utilization_pct: number | null; variance_vs_estimate: number | null; variance_vs_estimate_pct: number | null;
  cost_breakdown: { category: string; verified: number | null; pending: number | null }[]; timeline: { month: string; verified_actual: number; paid: number }[]; definitions: Record<string, string> };
type Pred = { status: 'ok' | 'insufficient_data'; model: string; message?: string; reason?: string; comparables_found?: number; comparables_required?: number; currency?: string;
  range_low?: number; median?: number; range_high?: number; unit_cost_per_m2?: { p25: number; p50: number; p75: number }; uncertainty?: string; comparables_used?: number;
  reference_data?: { oldest_completion: string; newest_completion: string }; cost_drivers?: { category: string; share_pct: number }[];
  comparables?: { code: string; name: string; area_m2: number; verified_actual: number; unit_cost_per_m2: number; completed: string }[]; assumptions?: string[]; verified_damaged_area_m2?: number };

const NEXT: Record<string, string[]> = { planning: ['approved', 'cancelled'], approved: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: ['closed'] };

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;
  const { org, user } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data: proj } = await sb.from('maintenance_projects').select('*').eq('id', id).maybeSingle();
  if (!proj) notFound();
  const pr = proj as { id: string; code: string; name: string; description: string; status: string; priority: number; repair_method: string | null; currency: string;
    verified_damaged_area_m2: number | null; contractor_id: string | null; planned_start: string | null; planned_end: string | null; actual_start: string | null; actual_end: string | null; org_id: string };
  const role = org.role;
  const finRead = can.financeOrEngineer(role);
  const path = `/app/projects/${id}`;
  const cur = pr.currency;
  const m = (v: number | null | undefined) => money(v ?? 0, cur, locale);

  const [fin, roads, budgets, estimates, contracts, wos, costs, invoices, payments, contractors, history, rates, members, pred] = await Promise.all([
    finRead ? sb.rpc('project_financials', { p_project: id }) : Promise.resolve({ data: null }),
    sb.from('project_roads').select('road_id').eq('project_id', id),
    finRead ? sb.from('budgets').select('*').eq('project_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    finRead ? sb.from('cost_estimates').select('*').eq('project_id', id).order('version', { ascending: false }) : Promise.resolve({ data: [] }),
    sb.from('contracts').select('*').eq('project_id', id).order('signed_on', { ascending: false }),
    sb.from('work_orders').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    sb.from('cost_items').select('*').eq('project_id', id).order('cost_date', { ascending: false }),
    sb.from('invoices').select('*').eq('project_id', id).order('invoice_date', { ascending: false }),
    sb.from('payments').select('*').eq('project_id', id).order('paid_on', { ascending: false }),
    can.staff(role) ? sb.from('contractors').select('id, name, status').eq('org_id', org.org_id).order('name') : Promise.resolve({ data: [] }),
    sb.from('project_status_history').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    finRead ? sb.from('unit_rates').select('id, category, description, unit, rate, currency, verified, source_title').eq('org_id', org.org_id).eq('verified', true) : Promise.resolve({ data: [] }),
    can.engineer(role) ? sb.rpc('org_member_directory', { p_org: org.org_id }) : Promise.resolve({ data: [] }),
    finRead && tab === 'prediction' ? sb.rpc('predict_project_cost', { p_project: id }) : Promise.resolve({ data: null }),
  ]);
  const f = fin.data as Fin | null;
  const roadIds = ((roads.data ?? []) as { road_id: string }[]).map((r) => r.road_id);
  const { data: roadRows } = roadIds.length ? await sb.from('road_segments').select('id, name, highway_class, length_m, condition').in('id', roadIds) : { data: [] };
  type Row = Record<string, string | number | null>;
  const L = <T,>(x: { data: unknown }) => (x.data ?? []) as T[];
  const contractRows = L<Row>(contracts); const invoiceRows = L<Row>(invoices); const paymentRows = L<Row>(payments);
  const ctrMap = new Map(L<{ id: string; name: string }>(contractors).map((c) => [c.id, c.name]));
  const memberRows = L<{ user_id: string; full_name: string; role: string }>(members).filter((x) => ['owner', 'road_engineer', 'field_inspector'].includes(x.role));

  const tabs = [
    { key: 'overview', label: p.projects.overview },
    ...(finRead ? [{ key: 'estimates', label: p.projects.estimates, count: L(estimates).length }] : []),
    { key: 'contracts', label: p.projects.contracts, count: contractRows.length },
    { key: 'work-orders', label: p.projects.workOrders, count: L(wos).length },
    { key: 'costs', label: p.projects.costs, count: L(costs).length },
    { key: 'invoices', label: p.projects.invoices, count: invoiceRows.length },
    ...(finRead ? [{ key: 'prediction', label: p.projects.prediction }] : []),
  ].map((x) => ({ ...x, href: `${path}?tab=${x.key}` }));

  const transitions = (NEXT[pr.status] ?? []).filter((to) =>
    (to === 'approved' || to === 'closed') ? can.approveFinance(role) : to === 'cancelled' ? role === 'owner' : can.engineer(role));

  return (
    <>
      <PageHeader title={pr.name} eyebrow={<Link href="/app/projects" className="text-xs font-[560] text-accent-text">← {p.projects.title}</Link>}
        subtitle={`${pr.code} · P${pr.priority} · ${cur}${pr.repair_method ? ` · ${pr.repair_method}` : ''}`}
        actions={<>
          <Badge tone={projectTone(pr.status)} dot className="h-7 px-3 text-xs">{t.projectStatus[pr.status as keyof typeof t.projectStatus]}</Badge>
          {transitions.length ? (
            <RpcForm rpc="transition_project" t={t} hidden={{ p_project: id }} revalidate={path} className="flex items-center gap-1.5" testId="project-transition">
              {transitions.map((to) => <SubmitButton key={to} size="sm" variant={to === 'cancelled' ? 'ghost' : 'primary'} name="p_to" value={to} testId={`to-${to}`}>{p.projects.transition}: {t.projectStatus[to as keyof typeof t.projectStatus]}</SubmitButton>)}
            </RpcForm>
          ) : null}
        </>} />
      <Tabs items={tabs} active={tab} />

      {tab === 'overview' ? (
        <>
          {f ? (
            <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6" aria-label="Financials" data-testid="project-kpis">
              <Kpi label={t.money.approved_budget} value={money(f.approved_budget, cur, locale, { compact: true })} hint={f.pending_budget ? `+${money(f.pending_budget, cur, locale, { compact: true })} ${t.common.pendingReview}` : undefined} icon={Landmark} />
              <Kpi label={t.money.approved_estimate} value={f.approved_estimate !== null ? money(f.approved_estimate, cur, locale, { compact: true }) : '—'} hint={f.estimate_version ? `v${f.estimate_version}` : t.common.notRecorded} icon={Calculator} tone="violet" />
              <Kpi label={t.money.committed} value={money(f.committed, cur, locale, { compact: true })} icon={FileCheck2} tone="blue" />
              <Kpi label={t.money.verified_actual} value={money(f.verified_actual, cur, locale, { compact: true })} hint={f.pending_actual ? `+${money(f.pending_actual, cur, locale, { compact: true })} ${t.common.pendingReview}` : undefined} icon={BadgeCheck} tone="teal" />
              <Kpi label={t.money.paid} value={money(f.paid, cur, locale, { compact: true })} hint={`${t.money.invoiced_approved}: ${money(f.invoiced_approved, cur, locale, { compact: true })}`} icon={Banknote} tone="green" />
              <Kpi label={t.money.remaining_available} value={money(f.remaining_available, cur, locale, { compact: true })} icon={PiggyBank} tone={f.remaining_available < 0 ? 'red' : 'green'}
                footer={f.budget_utilization_pct !== null ? <div className="flex items-center gap-2"><Progress value={f.budget_utilization_pct} tone={f.budget_utilization_pct > 100 ? 'red' : 'blue'} /><span className="tabular">{num(f.budget_utilization_pct, locale, 1)}%</span></div> : undefined} />
            </section>
          ) : null}
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="grid content-start gap-5">
              {f ? (
                <Card>
                  <CardHeader title={p.projects.breakdown} subtitle={cur} />
                  {f.cost_breakdown.length ? <HBarChart locale={locale} currency={cur} data={f.cost_breakdown.filter((c) => c.verified).map((c) => ({ label: t.costCategory[c.category as keyof typeof t.costCategory], value: Number(c.verified) }))} /> : <p className="text-sm text-ink-2">{t.common.none}</p>}
                  {f.variance_vs_estimate !== null ? (
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-sunken px-4 py-3 text-sm">
                      <span className="text-ink-2">{t.money.variance}</span>
                      <span className={`font-[620] tabular ${f.variance_vs_estimate > 0 ? 'text-crit-text' : 'text-ok-text'}`}>{f.variance_vs_estimate > 0 ? '+' : ''}{m(f.variance_vs_estimate)} ({num(f.variance_vs_estimate_pct, locale, 1)}%)</span>
                    </div>
                  ) : null}
                </Card>
              ) : null}
              {f && f.timeline.length ? (
                <Card>
                  <CardHeader title={p.projects.timeline} />
                  <TrendChart locale={locale} currency={cur} height={200} data={f.timeline.map((x) => ({ month: x.month, verified_actual: Number(x.verified_actual), paid: Number(x.paid) }))}
                    series={[{ key: 'verified_actual', label: t.money.verified_actual, color: 'var(--viz-1)' }, { key: 'paid', label: t.money.paid, color: 'var(--viz-3)' }]} />
                </Card>
              ) : null}
              <TableCard title={p.projects.roads} subtitle={`${(roadRows ?? []).length}`}>
                {(roadRows ?? []).length ? (
                  <table className="table"><tbody>{((roadRows ?? []) as { id: string; name: string | null; highway_class: string; length_m: number; condition: string }[]).map((r) => (
                    <tr key={r.id}><td><Link className="text-accent-text hover:underline" href={`/app/roads/${r.id}`}>{r.name ?? r.highway_class}</Link></td><td className="font-mono text-xs text-ink-2">{r.highway_class}</td><td className="num">{num(r.length_m, locale)} m</td><td><Badge>{t.condition[r.condition as keyof typeof t.condition]}</Badge></td></tr>))}</tbody></table>
                ) : <p className="px-5 py-4 text-sm text-ink-2">{t.common.none}</p>}
              </TableCard>
            </div>
            <div className="grid content-start gap-5">
              <Card>
                <CardHeader title={p.projects.overview} icon={FolderKanban} />
                <DefinitionList items={[
                  { label: p.projects.repairMethod, value: pr.repair_method ?? t.common.notRecorded },
                  { label: p.projects.area, value: pr.verified_damaged_area_m2 != null ? `${num(pr.verified_damaged_area_m2, locale, 2)} ${t.common.m2}` : t.common.notRecorded },
                  { label: p.projects.start, value: date(pr.planned_start, locale) }, { label: p.projects.end, value: date(pr.planned_end, locale) },
                  { label: p.projects.actualStart, value: date(pr.actual_start, locale) }, { label: p.projects.actualEnd, value: date(pr.actual_end, locale) },
                  { label: p.projects.contractor, value: (pr.contractor_id && ctrMap.get(pr.contractor_id)) || '—' },
                ]} />
                {pr.description ? <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">{pr.description}</p> : null}
              </Card>
              {finRead ? (
                <Card>
                  <CardHeader title={p.finance.budgets} icon={Landmark} />
                  <ul className="mb-4 space-y-2">
                    {L<Row>(budgets).map((b) => (
                      <li key={String(b.id)} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{String(b.label)} <span className="text-xs text-ink-3">FY{String(b.fiscal_year)}</span></span>
                        <span className="flex items-center gap-2"><span className="tabular">{m(Number(b.amount))}</span><Badge tone={approvalTone(String(b.status))}>{t.approval[String(b.status) as keyof typeof t.approval]}</Badge>
                          {b.status === 'submitted' && can.approveFinance(role) && b.submitted_by !== user.id ? <ReviewButtons rpc="review_budget" id={String(b.id)} t={t} revalidate={path} testId="review-budget" /> : null}</span>
                      </li>
                    ))}
                    {!L(budgets).length ? <li className="text-sm text-ink-2">{p.projects.noBudget}</li> : null}
                  </ul>
                  {can.approveFinance(role) ? (
                    <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-[13px] font-[560]">{p.projects.budget}</summary>
                      <RpcForm rpc="submit_budget" t={t} hidden={{ p_org: org.org_id, p_project: id, p_currency: cur }} revalidate={path} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2" testId="budget-form">
                        <Field label={p.projects.label} name="p_label" required><input name="p_label" className="input" required /></Field>
                        <Field label={p.projects.fiscalYear} name="p_fiscal_year" required><input name="p_fiscal_year" className="input" required defaultValue={new Date().getFullYear()} inputMode="numeric" /></Field>
                        <Field label={`${t.common.amount} (${cur})`} name="p_amount" required><input name="p_amount" className="input tabular" required inputMode="decimal" /></Field>
                        <Field label={p.projects.fundingSource} name="p_funding_source"><input name="p_funding_source" className="input" /></Field>
                        <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm">{t.common.submit}</SubmitButton></div>
                      </RpcForm>
                    </details>
                  ) : null}
                </Card>
              ) : null}
              <Card>
                <CardHeader title={p.projects.history} icon={History} />
                <ol className="space-y-2.5">{L<Row>(history).map((h) => (
                  <li key={String(h.id)} className="flex items-center gap-2 text-[13px]"><span className="size-1.5 rounded-full bg-accent" />
                    <span>{h.from_status ? `${t.projectStatus[String(h.from_status) as keyof typeof t.projectStatus]} → ` : ''}<span className="font-[560]">{t.projectStatus[String(h.to_status) as keyof typeof t.projectStatus]}</span></span>
                    <span className="ms-auto text-xs text-ink-3">{date(String(h.created_at), locale, true)}</span></li>))}</ol>
              </Card>
              {f ? <Card><CardHeader title={p.projects.definitions} icon={Info} /><dl className="space-y-2 text-xs">{Object.entries(f.definitions).map(([k, v]) => <div key={k}><dt className="font-[600] text-ink">{t.money[k as keyof typeof t.money] ?? k}</dt><dd className="text-ink-2">{v}</dd></div>)}</dl></Card> : null}
            </div>
          </div>
        </>
      ) : null}

      {tab === 'estimates' && finRead ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
          <TableCard title={p.projects.estimates}>
            {L(estimates).length ? (
              <table className="table"><thead><tr><th>{p.projects.version}</th><th>{t.common.date}</th><th className="num">{t.common.total}</th><th>{t.common.status}</th><th /></tr></thead>
                <tbody>{L<Row>(estimates).map((e) => (
                  <tr key={String(e.id)}><td className="font-mono">v{String(e.version)}</td><td className="text-xs">{date(String(e.created_at), locale)}</td><td className="num">{m(Number(e.total))}</td>
                    <td><Badge tone={approvalTone(String(e.status))}>{t.approval[String(e.status) as keyof typeof t.approval]}</Badge></td>
                    <td>{e.status === 'submitted' && can.approveFinance(role) && e.submitted_by !== user.id ? <ReviewButtons rpc="review_estimate" id={String(e.id)} t={t} revalidate={path} testId="review-estimate" /> : null}</td></tr>))}</tbody></table>
            ) : <EmptyState compact icon={Calculator} title={t.common.none} />}
          </TableCard>
          {can.engineer(role) ? (
            <Card>
              <CardHeader title={p.projects.estimate} subtitle={t.empty.unitRatesBody} />
              <RpcForm rpc="submit_estimate" t={t} hidden={{ p_project: id }} revalidate={path} className="space-y-3" testId="estimate-form">
                <EstimateBuilder currency={cur} rates={L(rates)} labels={{ category: t.common.description, qty: p.projects.qty, unit: p.projects.unit, rate: p.projects.rate, source: p.projects.rateSource, useRate: p.projects.useRate, manual: p.projects.manualRate, add: p.projects.addLine, total: t.common.total, desc: t.common.description }} categories={t.costCategory} locale={locale} />
                <Field label={p.projects.assumptions} name="p_assumptions"><textarea name="p_assumptions" className="textarea" rows={2} /></Field>
                <div className="flex justify-end"><SubmitButton testId="estimate-submit">{t.common.submit}</SubmitButton></div>
              </RpcForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'contracts' ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <TableCard title={p.projects.contracts}>
            {contractRows.length ? (
              <table className="table"><thead><tr><th>{p.projects.reference}</th><th>{p.projects.contractor}</th><th>{p.projects.signed}</th><th className="num">{t.common.amount}</th><th className="num">{p.projects.retention}</th><th>{t.common.status}</th></tr></thead>
                <tbody>{contractRows.map((c) => <tr key={String(c.id)}><td className="font-mono text-xs">{String(c.reference)}</td><td>{ctrMap.get(String(c.contractor_id)) ?? '—'}</td><td className="text-xs">{date(String(c.signed_on), locale)}</td><td className="num">{m(Number(c.amount))}</td><td className="num">{num(Number(c.retention_pct), locale, 2)}%</td><td><Badge>{String(c.status)}</Badge></td></tr>)}</tbody></table>
            ) : <EmptyState compact icon={FileCheck2} title={t.common.none} />}
          </TableCard>
          <div className="grid content-start gap-5">
            {can.approveFinance(role) ? (
              <Card><CardHeader title={p.projects.contract} />
                <RpcForm rpc="create_contract" t={t} hidden={{ p_project: id }} revalidate={path} resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="contract-form">
                  <Field label={p.projects.contractor} name="p_contractor" required><select name="p_contractor" className="select" required>{L<{ id: string; name: string; status: string }>(contractors).filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                  <Field label={p.projects.reference} name="p_reference" required><input name="p_reference" className="input font-mono" required /></Field>
                  <Field label={p.projects.signed} name="p_signed_on" required><input name="p_signed_on" type="date" className="input" required /></Field>
                  <Field label={`${t.common.amount} (${cur})`} name="p_amount" required><input name="p_amount" className="input tabular" required inputMode="decimal" /></Field>
                  <Field label={p.projects.retention} name="p_retention_pct"><input name="p_retention_pct" className="input" defaultValue="0" inputMode="decimal" /></Field>
                  <Field label={p.projects.warranty} name="p_warranty_months"><input name="p_warranty_months" className="input" inputMode="numeric" /></Field>
                  <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm">{t.common.create}</SubmitButton></div>
                </RpcForm>
              </Card>
            ) : null}
            {contractRows.length && (can.approveFinance(role) || can.engineer(role)) ? (
              <Card><CardHeader title={p.projects.changeOrder} />
                <RpcForm rpc="submit_change_order" t={t} revalidate={path} resetOnSuccess className="grid gap-3">
                  <Field label={p.projects.contracts} name="p_contract"><select name="p_contract" className="select">{contractRows.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.reference)}</option>)}</select></Field>
                  <Field label={`${t.common.amount} (± ${cur})`} name="p_amount" required><input name="p_amount" className="input tabular" required inputMode="decimal" /></Field>
                  <Field label={p.projects.reason} name="p_reason" required><input name="p_reason" className="input" required minLength={3} /></Field>
                  <div className="flex justify-end"><SubmitButton size="sm" variant="secondary">{t.common.submit}</SubmitButton></div>
                </RpcForm>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'work-orders' ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <TableCard title={p.projects.workOrders}>
            {L(wos).length ? (
              <table className="table"><thead><tr><th>{p.projects.woCode}</th><th>{p.projects.woTitle}</th><th>{t.common.status}</th><th className="w-32">{p.workOrders.progress}</th><th>{p.projects.due}</th></tr></thead>
                <tbody>{L<Row>(wos).map((w) => <tr key={String(w.id)}><td className="font-mono text-xs"><Link className="text-accent-text hover:underline" href={`/app/work-orders/${String(w.id)}`}>{String(w.code)}</Link></td><td className="max-w-56 truncate">{String(w.title)}</td><td><Badge tone={woTone(String(w.status))} dot>{t.woStatus[String(w.status) as keyof typeof t.woStatus]}</Badge></td><td><Progress value={Number(w.progress_pct)} tone="teal" /></td><td className="text-xs">{date(w.due_date as string | null, locale)}</td></tr>)}</tbody></table>
            ) : <EmptyState compact icon={FolderKanban} title={t.empty.workOrders} body={t.empty.workOrdersBody} />}
          </TableCard>
          {can.engineer(role) ? (
            <Card><CardHeader title={p.projects.createWo} />
              <RpcForm rpc="create_work_order" t={t} hidden={{ p_project: id }} revalidate={path} resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="wo-form">
                <Field label={p.projects.woCode} name="p_code" required><input name="p_code" className="input font-mono uppercase" required defaultValue={`WO-${pr.code}-`} /></Field>
                <Field label={p.projects.due} name="p_due_date"><input name="p_due_date" type="date" className="input" /></Field>
                <div className="sm:col-span-2"><Field label={p.projects.woTitle} name="p_title" required><input name="p_title" className="input" required minLength={3} /></Field></div>
                <Field label={p.projects.contractor} name="p_contractor"><select name="p_contractor" className="select"><option value="">—</option>{L<{ id: string; name: string }>(contractors).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label={p.projects.engineer} name="p_engineer"><select name="p_engineer" className="select"><option value="">—</option>{memberRows.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.user_id.slice(0, 8)}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field label={t.common.description} name="p_description"><textarea name="p_description" className="textarea" rows={2} /></Field></div>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm">{t.common.create}</SubmitButton></div>
              </RpcForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'costs' ? (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <TableCard title={p.projects.costs}>
            {L(costs).length ? (
              <table className="table"><thead><tr><th>{t.common.date}</th><th>{t.common.description}</th><th className="num">{p.projects.qty}</th><th className="num">{p.projects.rate}</th><th className="num">{t.common.amount}</th><th>{t.common.source}</th><th>{t.common.status}</th><th /></tr></thead>
                <tbody>{L<Row>(costs).map((c) => (
                  <tr key={String(c.id)}><td className="text-xs whitespace-nowrap">{date(String(c.cost_date), locale)}</td>
                    <td><p className="max-w-56 truncate">{String(c.description)}</p><p className="text-[11px] text-ink-3">{t.costCategory[String(c.category) as keyof typeof t.costCategory]}</p></td>
                    <td className="num">{num(Number(c.quantity), locale, 4)} {String(c.unit)}</td><td className="num">{num(Number(c.unit_rate), locale, 4)}</td><td className="num font-[560]">{m(Number(c.amount))}</td>
                    <td className="text-xs text-ink-2">{t.costSource[String(c.source_kind) as keyof typeof t.costSource]}</td>
                    <td><Badge tone={approvalTone(String(c.status))}>{t.approval[String(c.status) as keyof typeof t.approval]}</Badge></td>
                    <td>{c.status === 'submitted' && can.approveFinance(role) && c.submitted_by !== user.id ? <ReviewButtons rpc="review_cost_item" id={String(c.id)} t={t} revalidate={path} testId="review-cost" /> : null}</td></tr>))}</tbody></table>
            ) : <EmptyState compact icon={Receipt} title={t.common.none} />}
          </TableCard>
          {role !== 'executive_viewer' && role !== 'field_inspector' ? (
            <Card><CardHeader title={p.projects.costItem} subtitle={t.errors.INVALID_SOURCE} />
              <RpcForm rpc="submit_cost_item" t={t} hidden={{ p_project: id }} revalidate={path} resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="cost-form">
                <Field label={t.common.description} name="p_category"><select name="p_category" className="select">{Object.entries(t.costCategory).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label={p.projects.workOrders} name="p_work_order"><select name="p_work_order" className="select"><option value="">—</option>{L<Row>(wos).map((w) => <option key={String(w.id)} value={String(w.id)}>{String(w.code)}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field label={t.common.description} name="p_description" required><input name="p_description" className="input" required minLength={2} /></Field></div>
                <Field label={p.projects.qty} name="p_quantity" required><input name="p_quantity" className="input tabular" required inputMode="decimal" /></Field>
                <Field label={p.projects.unit} name="p_unit" required><input name="p_unit" className="input" required placeholder="m2, t, h, day" /></Field>
                <Field label={`${p.projects.rate} (${cur})`} name="p_unit_rate" required><input name="p_unit_rate" className="input tabular" required inputMode="decimal" /></Field>
                <Field label={t.common.date} name="p_cost_date" required><input name="p_cost_date" type="date" className="input" required /></Field>
                <div className="sm:col-span-2"><Field label={t.common.source} name="p_source_kind"><select name="p_source_kind" className="select" defaultValue={role === 'contractor' ? 'contractor_submission' : 'engineer_measurement'}>
                  {(role === 'contractor' ? ['contractor_submission'] : ['engineer_measurement', 'organization_record', 'invoice', 'contractor_submission']).map((k) => <option key={k} value={k}>{t.costSource[k as keyof typeof t.costSource]}</option>)}</select></Field></div>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm" testId="cost-submit">{t.common.submit}</SubmitButton></div>
              </RpcForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'invoices' ? (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="grid content-start gap-5">
            <TableCard title={p.finance.invoices}>
              {invoiceRows.length ? (
                <table className="table"><thead><tr><th>{p.projects.invoiceNo}</th><th>{t.common.date}</th><th className="num">{p.projects.net}</th><th className="num">{p.projects.tax}</th><th className="num">{t.common.total}</th><th className="num">{p.projects.outstanding}</th><th>{t.common.status}</th><th /></tr></thead>
                  <tbody>{invoiceRows.map((i) => {
                    const paidSum = paymentRows.filter((x) => x.invoice_id === i.id).reduce((a, x) => a + Number(x.amount), 0);
                    return (
                      <tr key={String(i.id)}><td className="font-mono text-xs">{String(i.invoice_number)}</td><td className="text-xs">{date(String(i.invoice_date), locale)}</td><td className="num">{m(Number(i.net_amount))}</td><td className="num">{m(Number(i.tax_amount))}</td><td className="num font-[560]">{m(Number(i.total_amount))}</td>
                        <td className="num">{i.status === 'approved' ? m(Number(i.total_amount) - paidSum) : '—'}</td>
                        <td><Badge tone={approvalTone(String(i.status))}>{t.approval[String(i.status) as keyof typeof t.approval]}</Badge></td>
                        <td>{i.status === 'submitted' && can.approveFinance(role) && i.submitted_by !== user.id ? <ReviewButtons rpc="review_invoice" id={String(i.id)} t={t} revalidate={path} testId="review-invoice" /> : null}</td></tr>
                    );
                  })}</tbody></table>
              ) : <EmptyState compact icon={Receipt} title={t.common.none} />}
            </TableCard>
            {paymentRows.length ? (
              <TableCard title={t.money.paid}>
                <table className="table"><thead><tr><th>{p.projects.paidOn}</th><th>{p.projects.reference}</th><th className="num">{t.common.amount}</th></tr></thead>
                  <tbody>{paymentRows.map((x) => <tr key={String(x.id)}><td className="text-xs">{date(String(x.paid_on), locale)}</td><td className="font-mono text-xs">{String(x.reference)}</td><td className="num">{m(Number(x.amount))}</td></tr>)}</tbody></table>
              </TableCard>
            ) : null}
          </div>
          <div className="grid content-start gap-5">
            {contractRows.length && (can.approveFinance(role) || role === 'contractor') ? (
              <Card><CardHeader title={p.projects.invoice} />
                <RpcForm rpc="submit_invoice" t={t} revalidate={path} resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="invoice-form">
                  <div className="sm:col-span-2"><Field label={p.projects.contracts} name="p_contract"><select name="p_contract" className="select">{contractRows.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.reference)}</option>)}</select></Field></div>
                  <Field label={p.projects.invoiceNo} name="p_invoice_number" required><input name="p_invoice_number" className="input font-mono" required /></Field>
                  <Field label={t.common.date} name="p_invoice_date" required><input name="p_invoice_date" type="date" className="input" required /></Field>
                  <Field label={`${p.projects.net} (${cur})`} name="p_net_amount" required><input name="p_net_amount" className="input tabular" required inputMode="decimal" /></Field>
                  <Field label={`${p.projects.tax} (${cur})`} name="p_tax_amount"><input name="p_tax_amount" className="input tabular" defaultValue="0" inputMode="decimal" /></Field>
                  <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm">{t.common.submit}</SubmitButton></div>
                </RpcForm>
              </Card>
            ) : null}
            {can.approveFinance(role) && invoiceRows.some((i) => i.status === 'approved') ? (
              <Card><CardHeader title={p.projects.payment} />
                <RpcForm rpc="record_payment" t={t} revalidate={path} resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="payment-form">
                  <div className="sm:col-span-2"><Field label={p.finance.invoices} name="p_invoice"><select name="p_invoice" className="select">{invoiceRows.filter((i) => i.status === 'approved').map((i) => <option key={String(i.id)} value={String(i.id)}>{String(i.invoice_number)} · {m(Number(i.total_amount))}</option>)}</select></Field></div>
                  <Field label={`${t.common.amount} (${cur})`} name="p_amount" required><input name="p_amount" className="input tabular" required inputMode="decimal" /></Field>
                  <Field label={p.projects.paidOn} name="p_paid_on" required><input name="p_paid_on" type="date" className="input" required /></Field>
                  <div className="sm:col-span-2"><Field label={p.projects.reference} name="p_reference" required><input name="p_reference" className="input font-mono" required /></Field></div>
                  <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm">{t.common.save}</SubmitButton></div>
                </RpcForm>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'prediction' && finRead ? <PredictionPanel pred={pred.data as Pred | null} t={t} p={p} locale={locale} actual={f?.verified_actual ?? null} status={pr.status} cur={cur} /> : null}
    </>
  );
}

function PredictionPanel({ pred, t, p, locale, actual, status, cur }: { pred: Pred | null; t: Awaited<ReturnType<typeof getAppDict>>['t']; p: Awaited<ReturnType<typeof getAppDict>>['p']; locale: 'en' | 'ar'; actual: number | null; status: string; cur: string }) {
  if (!pred) return null;
  if (pred.status !== 'ok') {
    return (
      <Card>
        <EmptyState icon={CircleOff} title={p.projects.insufficient}
          body={pred.reason === 'verified_damaged_area_required' ? pred.message : `${pred.comparables_found ?? 0} ${p.projects.found} · ${pred.comparables_required ?? 5} ${p.projects.required}`} />
        <p className="text-center text-xs text-ink-3">{p.projects.modelVersion}: <span className="font-mono">{pred.model}</span></p>
      </Card>
    );
  }
  const mm = (v?: number) => money(v ?? 0, pred.currency ?? cur, locale);
  const lo = pred.range_low ?? 0, hi = pred.range_high ?? 0, med = pred.median ?? 0;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]" data-testid="prediction">
      <Card>
        <CardHeader title={p.projects.range} icon={Sparkles} subtitle={`${p.projects.modelVersion}: ${pred.model}`} />
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div><p className="t-label">{p.projects.median}</p><p className="t-metric">{mm(med)}</p></div>
          <div className="text-sm text-ink-2">{mm(lo)} – {mm(hi)}</div>
          <Badge tone={pred.uncertainty === 'low' ? 'green' : pred.uncertainty === 'moderate' ? 'amber' : 'red'}>{p.projects.uncertainty}: {pred.uncertainty}</Badge>
        </div>
        <div className="relative mt-6 h-10 rounded-xl bg-sunken" aria-hidden>
          <div className="absolute inset-y-2 rounded-lg bg-accent-soft ring-1 ring-accent/40" style={{ insetInlineStart: '15%', insetInlineEnd: '15%' }} />
          <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ insetInlineStart: `${hi > lo ? 15 + ((med - lo) / (hi - lo)) * 70 : 50}%` }} />
        </div>
        <p className="mt-3 text-xs text-ink-2">{num(pred.verified_damaged_area_m2, locale, 2)} {t.common.m2} × {mm(pred.unit_cost_per_m2?.p25)}–{mm(pred.unit_cost_per_m2?.p75)} {p.projects.perM2} · {pred.comparables_used} {p.projects.comparables.toLowerCase()} · {p.projects.dataAge}: {date(pred.reference_data?.oldest_completion, locale)} – {date(pred.reference_data?.newest_completion, locale)}</p>
        {['completed', 'closed'].includes(status) && actual !== null ? <Notice tone="green" title={p.projects.afterCompletion}>{mm(actual)}</Notice> : null}
        <h3 className="t-card mt-6 mb-2">{p.projects.assumptions}</h3>
        <ul className="list-disc space-y-1 ps-5 text-sm text-ink-2">{(pred.assumptions ?? []).map((a) => <li key={a}>{a}</li>)}</ul>
      </Card>
      <div className="grid content-start gap-5">
        <Card><CardHeader title={p.projects.drivers} icon={TrendingUp} />
          <HBarChart locale={locale} unit="%" data={(pred.cost_drivers ?? []).map((d) => ({ label: t.costCategory[d.category as keyof typeof t.costCategory], value: Number(d.share_pct) }))} />
        </Card>
        <TableCard title={p.projects.comparables}>
          <table className="table"><thead><tr><th>{t.common.code}</th><th className="num">{t.common.m2}</th><th className="num">{p.projects.perM2}</th><th>{t.common.date}</th></tr></thead>
            <tbody>{(pred.comparables ?? []).map((c) => <tr key={c.code}><td className="font-mono text-xs">{c.code}</td><td className="num">{num(c.area_m2, locale, 1)}</td><td className="num">{mm(c.unit_cost_per_m2)}</td><td className="text-xs">{date(c.completed, locale)}</td></tr>)}</tbody></table>
        </TableCard>
      </div>
    </div>
  );
}
