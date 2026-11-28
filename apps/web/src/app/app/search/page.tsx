import Link from 'next/link';
import { Search as SearchIcon } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { Card, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { org } = await requireOrg();
  const { p } = await getAppDict();
  const q = ((await searchParams).q ?? '').trim();
  const sb = await supabaseServer();
  const like = `*${q.replace(/[*,()]/g, '')}*`;
  const [roads, prj, ctr, wo] = q.length >= 2 ? await Promise.all([
    sb.rpc('search_roads', { p_org: org.org_id, p_query: q, p_limit: 10 }),
    sb.from('maintenance_projects').select('id, code, name').eq('org_id', org.org_id).ilike('name', like).limit(10),
    sb.from('contractors').select('id, name').eq('org_id', org.org_id).ilike('name', like).limit(10),
    sb.from('work_orders').select('id, code, title').eq('org_id', org.org_id).ilike('title', like).limit(10),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const groups = [
    { title: p.search.roads, items: ((roads.data ?? []) as { id: string; name: string | null; highway_class: string }[]).map((r) => ({ href: `/app/roads/${r.id}`, label: r.name ?? r.highway_class, sub: r.highway_class })) },
    { title: p.search.projects, items: ((prj.data ?? []) as { id: string; code: string; name: string }[]).map((r) => ({ href: `/app/projects/${r.id}`, label: r.name, sub: r.code })) },
    { title: p.search.contractors, items: ((ctr.data ?? []) as { id: string; name: string }[]).map((r) => ({ href: `/app/contractors`, label: r.name, sub: '' })) },
    { title: p.search.workOrders, items: ((wo.data ?? []) as { id: string; code: string; title: string }[]).map((r) => ({ href: `/app/work-orders/${r.id}`, label: r.title, sub: r.code })) },
  ].filter((g) => g.items.length);
  return (
    <div className="max-w-3xl">
      <PageHeader title={p.search.title} />
      <form className="relative mb-6" role="search"><SearchIcon size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input name="q" defaultValue={q} autoFocus className="input h-12 ps-10 text-base" placeholder={p.search.placeholder} /></form>
      {groups.length ? groups.map((g) => (
        <Card key={g.title} className="mb-4"><h2 className="t-label mb-2">{g.title}</h2>
          <ul className="divide-y divide-line">{g.items.map((i) => <li key={i.href + i.label}><Link href={i.href} className="flex items-center justify-between py-2.5 text-sm hover:text-accent-text"><span>{i.label}</span><span className="font-mono text-xs text-ink-3">{i.sub}</span></Link></li>)}</ul></Card>
      )) : q ? <EmptyState icon={SearchIcon} title={p.search.none} /> : null}
    </div>
  );
}
