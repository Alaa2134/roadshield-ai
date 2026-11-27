import Link from 'next/link';
import { Inbox, BookOpen, Landmark, FileCheck2, BadgeCheck, Banknote, PiggyBank, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SpendingExplorer } from '@/components/app/SpendingExplorer';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Field, Kpi, Notice, PageHeader, TableCard } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm, ReviewButtons } from '@/components/app/RpcForm';

export const metadata = { title: 'Finance & Budgets' };
type R = Record<string, string | number | boolean | null>;

export default async function Finance({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const sp = await searchParams;
  const months = [3, 6, 12, 24].includes(Number(sp.months)) ? Number(sp.months) : 12;
  const { org, user } = await requireOrg();
  if (!can.readFinance(org.role)) redirect('/app');
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const cur = org.default_currency;
  const [ov, b, e, c, i, rates, prj, trend] = await Promise.all([
    sb.rpc('org_overview', { p_org: org.org_id }),
    sb.from('budgets').select('*').eq('org_id', org.org_id).eq('status', 'submitted'),
    sb.from('cost_estimates').select('*').eq('org_id', org.org_id).eq('status', 'submitted'),
    sb.from('cost_items').select('*').eq('org_id', org.org_id).eq('status', 'submitted').order('cost_date', { ascending: false }),
    sb.from('invoices').select('*').eq('org_id', org.org_id).eq('status', 'submitted'),
    sb.from('unit_rates').select('*').eq('org_id', org.org_id).order('created_at', { ascending: false }),
    sb.from('maintenance_projects').select('id, code').eq('org_id', org.org_id),
    sb.rpc('org_spending_trend', { p_org: org.org_id, p_months: months }),
  ]);
  const trendRows = ((trend.data ?? []) as { month: string; verified_actual: number; invoiced_approved: number; paid: number }[])
    .map((r) => ({ month: r.month, verified_actual: Number(r.verified_actual), invoiced_approved: Number(r.invoiced_approved), paid: Number(r.paid) }));
  const f = (ov.data as { finance: Record<string, number> | null } | null)?.finance;
  const code = new Map(((prj.data ?? []) as { id: string; code: string }[]).map((x) => [x.id, x.code]));
  const approver = can.approveFinance(org.role);
  const queue: { kind: string; rpc: string; row: R; label: string; amount: number; currency: string; submitter: string | null }[] = [
    ...((b.data ?? []) as R[]).map((r) => ({ kind: p.finance.budgets, rpc: 'review_budget', row: r, label: `${r.label} · FY${r.fiscal_year}`, amount: Number(r.amount), currency: String(r.currency), submitter: r.submitted_by as string | null })),
    ...((e.data ?? []) as R[]).map((r) => ({ kind: p.finance.estimates, rpc: 'review_estimate', row: r, label: `v${r.version}`, amount: Number(r.total), currency: String(r.currency), submitter: r.submitted_by as string | null })),
    ...((c.data ?? []) as R[]).map((r) => ({ kind: p.finance.costs, rpc: 'review_cost_item', row: r, label: `${r.description} · ${t.costCategory[String(r.category) as keyof typeof t.costCategory]}`, amount: Number(r.amount), currency: String(r.currency), submitter: r.submitted_by as string | null })),
    ...((i.data ?? []) as R[]).map((r) => ({ kind: p.finance.invoices, rpc: 'review_invoice', row: r, label: String(r.invoice_number), amount: Number(r.total_amount), currency: String(r.currency), submitter: r.submitted_by as string | null })),
  ];
  return (
    <>
      <PageHeader title={p.finance.title} subtitle={p.finance.subtitle} />
      {f ? (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <Kpi label={t.money.approved_budget} value={money(f.approved_budget_total, cur, locale, { compact: true })} icon={Landmark} />
          <Kpi label={t.money.committed} value={money(f.committed, cur, locale, { compact: true })} icon={FileCheck2} />
          <Kpi label={t.money.verified_actual} value={money(f.verified_actual, cur, locale, { compact: true })} icon={BadgeCheck} tone="teal" />
          <Kpi label={t.money.paid} value={money(f.paid, cur, locale, { compact: true })} icon={Banknote} tone="green" />
          <Kpi label={t.money.remaining_available} value={money(f.remaining_available, cur, locale, { compact: true })} icon={PiggyBank} tone={(f.remaining_available ?? 0) < 0 ? 'red' : 'green'} />
        </section>
      ) : null}
      <Card className="mt-5"><CardHeader title={p.finance.trend} />
        <Suspense>
          <SpendingExplorer org={org.org_id} rows={trendRows} months={months} currency={cur} locale={locale} labels={{
            verified: t.money.verified_actual, invoiced: t.money.invoiced_approved, paid: t.money.paid, period: p.finance.period, months: p.finance.months,
            click: p.finance.click, costs: p.finance.recCosts, invoices: p.finance.recInvoices, payments: p.finance.recPayments, none: p.finance.none, close: p.finance.close, empty: p.finance.trendEmpty }} />
        </Suspense>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <TableCard title={p.finance.queue} subtitle={`${queue.length}`}>
          <div className="px-5 pt-4"><Notice tone="blue" icon={ShieldCheck}>{p.finance.fourEyes}</Notice></div>
          {queue.length ? (
            <table className="table mt-3" data-testid="approval-queue"><thead><tr><th>{p.finance.type}</th><th>{p.finance.project}</th><th>{t.common.description}</th><th className="num">{t.common.amount}</th><th /></tr></thead>
              <tbody>{queue.map((q) => (
                <tr key={String(q.row.id)}><td><Badge tone="amber">{q.kind}</Badge></td>
                  <td className="font-mono text-xs">{q.row.project_id ? <Link className="text-accent-text hover:underline" href={`/app/projects/${q.row.project_id}`}>{code.get(String(q.row.project_id)) ?? '—'}</Link> : '—'}</td>
                  <td className="max-w-64 truncate">{q.label}</td>
                  <td className="num font-[560]">{money(q.amount, q.currency, locale)}</td>
                  <td>{approver && q.submitter !== user.id ? <ReviewButtons rpc={q.rpc} id={String(q.row.id)} t={t} revalidate="/app/finance" /> : <span className="text-xs text-ink-3">{t.common.pendingReview}</span>}</td></tr>))}</tbody></table>
          ) : <EmptyState compact icon={Inbox} title={t.empty.approvals} body={t.empty.approvalsBody} />}
        </TableCard>
        <div className="grid content-start gap-5">
          <TableCard title={p.finance.unitRates}>
            {(rates.data ?? []).length ? (
              <table className="table"><tbody>{((rates.data ?? []) as R[]).map((r) => (
                <tr key={String(r.id)}><td><p className="max-w-48 truncate font-[540]">{String(r.description)}</p><p className="max-w-48 truncate text-[11px] text-ink-3">{String(r.source_title)} · {date(String(r.effective_date), locale)}</p></td>
                  <td className="num">{money(Number(r.rate), String(r.currency), locale)}/{String(r.unit)}</td>
                  <td><Badge tone="neutral">{p.finance.kinds[String(r.rate_kind) as keyof typeof p.finance.kinds]}</Badge></td>
                  <td>{r.verified ? <Badge tone="green">{p.finance.verified}</Badge> : approver && r.created_by !== user.id ? (
                    <RpcForm rpc="verify_unit_rate" t={t} hidden={{ p_id: String(r.id) }} revalidate="/app/finance"><SubmitButton size="sm" variant="secondary">{p.finance.verify}</SubmitButton></RpcForm>
                  ) : <Badge tone="amber">{p.finance.unverified}</Badge>}</td></tr>))}</tbody></table>
            ) : <EmptyState compact icon={BookOpen} title={t.empty.unitRates} body={t.empty.unitRatesBody} />}
          </TableCard>
          {org.role !== 'executive_viewer' ? (
            <Card><CardHeader title={p.finance.addRate} />
              <RpcForm rpc="add_unit_rate" t={t} hidden={{ p_org: org.org_id, p_currency: cur }} revalidate="/app/finance" resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="rate-form">
                <Field label={t.common.description} name="p_category"><select name="p_category" className="select">{Object.entries(t.costCategory).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label={p.finance.rateKind} name="p_rate_kind"><select name="p_rate_kind" className="select">{Object.entries(p.finance.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field label={t.common.description} name="p_description" required><input name="p_description" className="input" required minLength={3} /></Field></div>
                <Field label={p.projects.unit} name="p_unit" required><input name="p_unit" className="input" required placeholder="m2" /></Field>
                <Field label={`${p.projects.rate} (${cur})`} name="p_rate" required><input name="p_rate" className="input tabular" required inputMode="decimal" /></Field>
                <Field label={p.finance.effective} name="p_effective_date" required><input name="p_effective_date" type="date" className="input" required /></Field>
                <Field label={t.common.source} name="p_source_kind"><select name="p_source_kind" className="select">{Object.entries(t.costSource).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <div className="sm:col-span-2"><Field label={p.finance.sourceTitle} name="p_source_title" required><input name="p_source_title" className="input" required minLength={3} /></Field></div>
                <div className="sm:col-span-2"><Field label={p.finance.sourceUrl} name="p_source_url"><input name="p_source_url" type="url" className="input" /></Field></div>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm">{t.common.submit}</SubmitButton></div>
              </RpcForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
