import Link from 'next/link';
import { Route, Upload, Search } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, num } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, PageHeader, TableCard, conditionTone } from '@/components/ui';

export const metadata = { title: 'Road Network' };
const PAGE = 50;
type Row = { id: string; name: string | null; name_ar: string | null; ref: string | null; highway_class: string; condition: string; length_m: number; condition_assessed_at?: string | null; osm_way_id?: number | null };

export default async function Roads({ searchParams }: { searchParams: Promise<{ q?: string; condition?: string; class?: string; page?: string }> }) {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sp = await searchParams;
  const sb = await supabaseServer();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  let rows: Row[] = []; let total = 0;
  if (sp.q) {
    const { data } = await sb.rpc('search_roads', { p_org: org.org_id, p_query: sp.q, p_limit: 100 });
    rows = (data ?? []) as Row[]; total = rows.length;
  } else {
    let q = sb.from('road_segments').select('id, name, name_ar, ref, highway_class, condition, length_m, condition_assessed_at, osm_way_id', { count: 'exact' })
      .eq('org_id', org.org_id);
    if (sp.condition) q = q.eq('condition', sp.condition);
    if (sp.class) q = q.eq('highway_class', sp.class);
    const { data, count } = await q.order('length_m', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
    rows = (data ?? []) as Row[]; total = count ?? rows.length;
  }
  const classes = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street'];
  const pages = Math.ceil(total / PAGE);
  const qs = (o: Record<string, string | number | undefined>) => '?' + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();
  return (
    <>
      <PageHeader title={p.roads.title} subtitle={p.roads.subtitle}
        actions={can.engineer(org.role) ? <ButtonLink href="/app/roads/import" icon={Upload} size="sm">{p.roads.import}</ButtonLink> : undefined} />
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={sp.q} className="input ps-9" placeholder={p.roads.searchPlaceholder} />
        </div>
        <select name="condition" defaultValue={sp.condition ?? ''} className="select w-auto" aria-label={p.roads.condition}>
          <option value="">{p.roads.condition}: {t.common.all}</option>
          {(['good', 'fair', 'poor', 'critical', 'unknown'] as const).map((c) => <option key={c} value={c}>{t.condition[c]}</option>)}
        </select>
        <select name="class" defaultValue={sp.class ?? ''} className="select w-auto" aria-label={p.roads.class}>
          <option value="">{p.roads.class}: {t.common.all}</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-secondary">{t.common.filter}</button>
      </form>
      <TableCard footer={`${num(total, locale)} ${p.roads.segments}`}>
        {rows.length ? (
          <table className="table">
            <thead><tr><th>{t.common.name}</th><th>{p.roads.ref}</th><th>{p.roads.class}</th><th className="num">{p.roads.length}</th><th>{p.roads.condition}</th><th>{p.roads.assessed}</th><th>{p.roads.osmWay}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-72 truncate"><Link href={`/app/roads/${r.id}`} className="font-[560] text-ink hover:text-accent-text">{(locale === 'ar' && r.name_ar) || r.name || <span className="text-ink-3">{t.common.unknown}</span>}</Link></td>
                  <td className="text-ink-2">{r.ref ?? '—'}</td>
                  <td><span className="font-mono text-xs text-ink-2">{r.highway_class}</span></td>
                  <td className="num">{num(r.length_m, locale)} {t.common.m}</td>
                  <td><Badge tone={conditionTone(r.condition)} dot>{t.condition[r.condition as keyof typeof t.condition]}</Badge></td>
                  <td className="text-xs text-ink-2">{date(r.condition_assessed_at, locale)}</td>
                  <td className="font-mono text-xs text-ink-3">{r.osm_way_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Route} title={total === 0 && !sp.q && !sp.condition && !sp.class ? t.overview.noRoads : p.roads.noResults} body={total === 0 && !sp.q ? t.overview.noRoadsBody : undefined} />}
      </TableCard>
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-ink-2">{page} / {pages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link className="btn btn-sm btn-secondary" href={qs({ page: page - 1 })}>{t.common.previous}</Link> : null}
            {page < pages ? <Link className="btn btn-sm btn-secondary" href={qs({ page: page + 1 })}>{t.common.next}</Link> : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
