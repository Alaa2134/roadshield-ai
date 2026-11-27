import Link from 'next/link';
import { ClipboardList, Send, Receipt } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money } from '@/lib/format';
import { Badge, EmptyState, Kpi, PageHeader, Progress, TableCard, woTone, approvalTone } from '@/components/ui';

export async function ContractorHome() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const [{ data: wos }, { data: invoices }] = await Promise.all([
    sb.from('work_orders').select('id, code, title, status, progress_pct, due_date, project_id').eq('org_id', org.org_id).order('due_date', { ascending: true }),
    sb.from('invoices').select('id, invoice_number, invoice_date, total_amount, currency, status').eq('org_id', org.org_id).order('invoice_date', { ascending: false }).limit(10),
  ]);
  const w = (wos ?? []) as { id: string; code: string; title: string; status: string; progress_pct: number; due_date: string | null }[];
  const inv = (invoices ?? []) as { id: string; invoice_number: string; invoice_date: string; total_amount: number; currency: string; status: string }[];
  return (
    <>
      <PageHeader title={p.contractorHome.title} subtitle={p.contractorHome.subtitle} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label={p.contractorHome.active} value={w.filter((x) => ['issued', 'in_progress', 'rejected'].includes(x.status)).length} icon={ClipboardList} />
        <Kpi label={p.contractorHome.toSubmit} value={w.filter((x) => x.status === 'in_progress').length} icon={Send} tone="teal" />
        <Kpi label={p.contractorHome.invoices} value={inv.filter((x) => x.status === 'submitted').length} icon={Receipt} tone="amber" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <TableCard title={t.nav.workOrders}>
          {w.length ? (
            <table className="table"><thead><tr><th>{t.common.code}</th><th>{p.projects.woTitle}</th><th>{t.common.status}</th><th className="w-36">{p.workOrders.progress}</th><th>{p.projects.due}</th></tr></thead>
              <tbody>{w.map((x) => (
                <tr key={x.id}>
                  <td className="font-mono text-xs"><Link className="text-accent-text hover:underline" href={`/app/work-orders/${x.id}`}>{x.code}</Link></td>
                  <td className="max-w-56 truncate">{x.title}</td>
                  <td><Badge tone={woTone(x.status)} dot>{t.woStatus[x.status as keyof typeof t.woStatus]}</Badge></td>
                  <td><Progress value={x.progress_pct} tone="teal" /></td>
                  <td className="text-xs text-ink-2">{date(x.due_date, locale)}</td>
                </tr>))}</tbody></table>
          ) : <EmptyState compact icon={ClipboardList} title={t.empty.workOrders} />}
        </TableCard>
        <TableCard title={p.finance.invoices} action={<Link href="/app/procurement" className="text-[13px] font-[560] text-accent-text">{t.common.view}</Link>}>
          {inv.length ? (
            <table className="table"><thead><tr><th>{p.projects.invoiceNo}</th><th>{t.common.date}</th><th className="num">{t.common.total}</th><th>{t.common.status}</th></tr></thead>
              <tbody>{inv.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.invoice_number}</td><td>{date(x.invoice_date, locale)}</td><td className="num">{money(x.total_amount, x.currency, locale)}</td><td><Badge tone={approvalTone(x.status)}>{t.approval[x.status as keyof typeof t.approval]}</Badge></td></tr>)}</tbody></table>
          ) : <EmptyState compact icon={Receipt} title={t.empty.generic} />}
        </TableCard>
      </div>
    </>
  );
}
