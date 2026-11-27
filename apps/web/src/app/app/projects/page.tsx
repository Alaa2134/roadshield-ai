import Link from 'next/link';
import { FolderKanban, Plus } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money, num } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, PageHeader, Progress, TableCard, projectTone } from '@/components/ui';

export const metadata = { title: 'Maintenance Projects' };
type P = { id: string; code: string; name: string; status: string; priority: number; currency: string; contractor_name: string | null; road_count: number; road_km: number;
  planned_start: string | null; planned_end: string | null; approved_budget: number | null; verified_actual: number | null; committed: number | null; paid: number | null; open_work_orders: number };

export default async function Projects({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.rpc('project_list', { p_org: org.org_id });
  const all = (data ?? []) as P[];
  const rows = sp.status ? all.filter((x) => x.status === sp.status) : all;
  const fin = can.financeOrEngineer(org.role);
  const statuses = ['planning', 'approved', 'in_progress', 'completed', 'closed', 'cancelled'] as const;
  return (
    <>
      <PageHeader title={p.projects.title} subtitle={p.projects.subtitle} actions={can.engineer(org.role) ? <ButtonLink href="/app/projects/new" icon={Plus} size="sm">{p.projects.new}</ButtonLink> : undefined} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/app/projects" className={`badge h-8 px-3 text-xs ${!sp.status ? 'bg-ink text-bg' : 'bg-surface text-ink-2 border border-line'}`}>{t.common.all} · {all.length}</Link>
        {statuses.map((s) => <Link key={s} href={`/app/projects?status=${s}`} className={`badge h-8 px-3 text-xs ${sp.status === s ? 'bg-ink text-bg' : 'bg-surface text-ink-2 border border-line'}`}>{t.projectStatus[s]} · {all.filter((x) => x.status === s).length}</Link>)}
      </div>
      <TableCard>
        {rows.length ? (
          <table className="table">
            <thead><tr><th>{t.common.code}</th><th>{t.common.name}</th><th>{t.common.status}</th><th className="num">{p.projects.priority}</th><th className="num">{p.projects.km}</th><th>{p.projects.contractor}</th><th>{p.projects.schedule}</th>
              {fin ? <><th className="num">{t.money.approved_budget}</th><th className="num">{t.money.verified_actual}</th><th className="w-32">{t.money.utilization}</th></> : null}</tr></thead>
            <tbody>
              {rows.map((x) => {
                const util = x.approved_budget ? (Number(x.verified_actual ?? 0) / Number(x.approved_budget)) * 100 : null;
                return (
                  <tr key={x.id}>
                    <td className="font-mono text-xs"><Link href={`/app/projects/${x.id}`} className="text-accent-text hover:underline">{x.code}</Link></td>
                    <td className="max-w-64 truncate font-[540]"><Link href={`/app/projects/${x.id}`}>{x.name}</Link></td>
                    <td><Badge tone={projectTone(x.status)} dot>{t.projectStatus[x.status as keyof typeof t.projectStatus]}</Badge></td>
                    <td className="num">P{x.priority}</td>
                    <td className="num">{num(x.road_km, locale, 2)}</td>
                    <td className="max-w-40 truncate text-ink-2">{x.contractor_name ?? '—'}</td>
                    <td className="text-xs text-ink-2 whitespace-nowrap">{date(x.planned_start, locale)} → {date(x.planned_end, locale)}</td>
                    {fin ? <>
                      <td className="num">{money(x.approved_budget, x.currency, locale)}</td>
                      <td className="num">{money(x.verified_actual ?? 0, x.currency, locale)}</td>
                      <td>{util !== null ? <div className="flex items-center gap-2"><Progress value={util} tone={util > 100 ? 'red' : 'blue'} /><span className="w-9 text-end text-xs tabular">{num(util, locale, 0)}%</span></div> : <span className="text-xs text-ink-3">—</span>}</td>
                    </> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyState icon={FolderKanban} title={t.empty.projects} body={t.empty.projectsBody} action={can.engineer(org.role) ? <ButtonLink href="/app/projects/new" icon={Plus}>{p.projects.new}</ButtonLink> : undefined} />}
      </TableCard>
    </>
  );
}
