import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money } from '@/lib/format';
import { Badge, EmptyState, PageHeader, TableCard, approvalTone } from '@/components/ui';
import { ReviewButtons } from '@/components/app/RpcForm';

export const metadata = { title: 'Procurement' };
type R = Record<string, string | number | null>;

export default async function Procurement() {
  const { org, user } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const [c, co, inv, ctr, prj] = await Promise.all([
    sb.from('contracts').select('*').eq('org_id', org.org_id).order('signed_on', { ascending: false }),
    sb.from('change_orders').select('*').eq('org_id', org.org_id).order('created_at', { ascending: false }),
    sb.from('invoices').select('*').eq('org_id', org.org_id).order('invoice_date', { ascending: false }).limit(100),
    sb.from('contractors').select('id, name').eq('org_id', org.org_id),
    sb.from('maintenance_projects').select('id, code').eq('org_id', org.org_id),
  ]);
  const cn = new Map(((ctr.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const pc = new Map(((prj.data ?? []) as { id: string; code: string }[]).map((x) => [x.id, x.code]));
  const contracts = (c.data ?? []) as R[];
  const ref = new Map(contracts.map((x) => [String(x.id), String(x.reference)]));
  const coRows = (co.data ?? []) as R[];
  const commitment = (id: string) => contracts.filter((x) => x.id === id).reduce((a, x) => a + Number(x.amount), 0) + coRows.filter((x) => x.contract_id === id && x.status === 'approved').reduce((a, x) => a + Number(x.amount), 0);
  return (
    <>
      <PageHeader title={p.procurement.title} subtitle={p.procurement.subtitle} />
      <div className="grid gap-5">
        <TableCard title={p.procurement.contracts}>
          {contracts.length ? (
            <table className="table"><thead><tr><th>{p.projects.reference}</th><th>{p.finance.project}</th><th>{p.projects.contractor}</th><th>{p.projects.signed}</th><th className="num">{t.common.amount}</th><th className="num">{p.procurement.commitment}</th><th>{t.common.status}</th></tr></thead>
              <tbody>{contracts.map((x) => <tr key={String(x.id)}><td className="font-mono text-xs">{String(x.reference)}</td>
                <td className="font-mono text-xs">{pc.has(String(x.project_id)) ? <Link className="text-accent-text hover:underline" href={`/app/projects/${x.project_id}?tab=contracts`}>{pc.get(String(x.project_id))}</Link> : '—'}</td>
                <td>{cn.get(String(x.contractor_id)) ?? '—'}</td><td className="text-xs">{date(String(x.signed_on), locale)}</td>
                <td className="num">{money(Number(x.amount), String(x.currency), locale)}</td><td className="num font-[560]">{money(commitment(String(x.id)), String(x.currency), locale)}</td><td><Badge>{String(x.status)}</Badge></td></tr>)}</tbody></table>
          ) : <EmptyState compact icon={FileText} title={t.common.none} />}
        </TableCard>
        <div className="grid gap-5 xl:grid-cols-2">
          <TableCard title={p.procurement.changeOrders}>
            {coRows.length ? (
              <table className="table"><tbody>{coRows.map((x) => <tr key={String(x.id)}><td className="font-mono text-xs">{ref.get(String(x.contract_id)) ?? '—'}</td><td className="max-w-48 truncate">{String(x.reason)}</td>
                <td className="num">{money(Number(x.amount), contracts.find((k) => k.id === x.contract_id)?.currency as string ?? org.default_currency, locale)}</td>
                <td><Badge tone={approvalTone(String(x.status))}>{t.approval[String(x.status) as keyof typeof t.approval]}</Badge></td>
                <td>{x.status === 'submitted' && can.approveFinance(org.role) && x.submitted_by !== user.id ? <ReviewButtons rpc="review_change_order" id={String(x.id)} t={t} revalidate="/app/procurement" /> : null}</td></tr>)}</tbody></table>
            ) : <EmptyState compact icon={FileText} title={t.common.none} />}
          </TableCard>
          <TableCard title={p.finance.invoices}>
            {(inv.data ?? []).length ? (
              <table className="table"><tbody>{((inv.data ?? []) as R[]).map((x) => <tr key={String(x.id)}><td className="font-mono text-xs">{String(x.invoice_number)}</td><td className="text-xs">{date(String(x.invoice_date), locale)}</td><td className="text-ink-2">{cn.get(String(x.contractor_id)) ?? '—'}</td>
                <td className="num">{money(Number(x.total_amount), String(x.currency), locale)}</td><td><Badge tone={approvalTone(String(x.status))}>{t.approval[String(x.status) as keyof typeof t.approval]}</Badge></td></tr>)}</tbody></table>
            ) : <EmptyState compact icon={FileText} title={t.common.none} />}
          </TableCard>
        </div>
      </div>
    </>
  );
}
