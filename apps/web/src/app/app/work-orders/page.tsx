import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date } from '@/lib/format';
import { Badge, EmptyState, PageHeader, Progress, TableCard, woTone } from '@/components/ui';

export const metadata = { title: 'Work Orders' };
type W = { id: string; code: string; title: string; status: string; progress_pct: number; due_date: string | null; project_id: string; contractor_id: string | null };

export default async function WorkOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sp = await searchParams;
  const sb = await supabaseServer();
  let q = sb.from('work_orders').select('id, code, title, status, progress_pct, due_date, project_id, contractor_id').eq('org_id', org.org_id);
  if (sp.status) q = q.eq('status', sp.status);
  const [{ data }, { data: ctrs }, { data: prjs }] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(200),
    sb.from('contractors').select('id, name').eq('org_id', org.org_id),
    sb.from('maintenance_projects').select('id, code').eq('org_id', org.org_id),
  ]);
  const rows = (data ?? []) as W[];
  const cn = new Map(((ctrs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const pc = new Map(((prjs ?? []) as { id: string; code: string }[]).map((c) => [c.id, c.code]));
  const statuses = ['draft', 'issued', 'in_progress', 'submitted', 'accepted', 'rejected', 'cancelled'] as const;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={p.workOrders.title} subtitle={p.workOrders.subtitle} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/app/work-orders" className={`badge h-8 px-3 text-xs ${!sp.status ? 'bg-ink text-bg' : 'border border-line bg-surface text-ink-2'}`}>{t.common.all}</Link>
        {statuses.map((s) => <Link key={s} href={`/app/work-orders?status=${s}`} className={`badge h-8 px-3 text-xs ${sp.status === s ? 'bg-ink text-bg' : 'border border-line bg-surface text-ink-2'}`}>{t.woStatus[s]}</Link>)}
      </div>
      <TableCard>
        {rows.length ? (
          <table className="table"><thead><tr><th>{p.projects.woCode}</th><th>{p.projects.woTitle}</th><th>{p.finance.project}</th><th>{p.projects.contractor}</th><th>{t.common.status}</th><th className="w-36">{p.workOrders.progress}</th><th>{p.projects.due}</th></tr></thead>
            <tbody>{rows.map((w) => {
              const overdue = w.due_date && w.due_date < today && !['accepted', 'cancelled'].includes(w.status);
              return (
                <tr key={w.id}><td className="font-mono text-xs"><Link className="text-accent-text hover:underline" href={`/app/work-orders/${w.id}`}>{w.code}</Link></td>
                  <td className="max-w-60 truncate">{w.title}</td>
                  <td className="font-mono text-xs">{pc.has(w.project_id) ? <Link href={`/app/projects/${w.project_id}`} className="hover:underline">{pc.get(w.project_id)}</Link> : '—'}</td>
                  <td className="text-ink-2">{(w.contractor_id && cn.get(w.contractor_id)) || '—'}</td>
                  <td><Badge tone={woTone(w.status)} dot>{t.woStatus[w.status as keyof typeof t.woStatus]}</Badge></td>
                  <td><div className="flex items-center gap-2"><Progress value={w.progress_pct} tone="teal" /><span className="w-9 text-end text-xs tabular">{w.progress_pct}%</span></div></td>
                  <td className={`text-xs ${overdue ? 'font-[600] text-crit-text' : 'text-ink-2'}`}>{date(w.due_date, locale)}</td></tr>
              );
            })}</tbody></table>
        ) : <EmptyState icon={ClipboardList} title={t.empty.workOrders} body={t.empty.workOrdersBody} />}
      </TableCard>
    </>
  );
}
