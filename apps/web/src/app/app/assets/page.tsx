import { Box } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { num } from '@/lib/format';
import { EmptyState, Notice, PageHeader, TableCard } from '@/components/ui';

export const metadata = { title: 'Road Assets' };

export default async function Assets() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data } = await sb.rpc('road_asset_register', { p_org: org.org_id });
  const rows = (data ?? []) as { highway_class: string; segments: number; km: number; with_surface: number; with_width: number; named: number }[];
  return (
    <>
      <PageHeader title={p.assets.title} subtitle={p.assets.subtitle} />
      <div className="mb-4"><Notice tone="blue">{p.roads.unknownNote}</Notice></div>
      <TableCard>
        {rows.length ? (
          <table className="table"><thead><tr><th>{p.assets.class}</th><th className="num">{p.assets.count}</th><th className="num">{p.assets.km}</th><th className="num">{p.assets.tagged}</th><th className="num">{p.assets.width}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.highway_class}><td className="font-mono text-xs">{r.highway_class}</td><td className="num">{num(r.segments, locale)}</td><td className="num">{num(r.km, locale, 2)}</td><td className="num">{num(r.with_surface, locale)}</td><td className="num">{num(r.with_width, locale)}</td></tr>)}</tbody></table>
        ) : <EmptyState icon={Box} title={t.overview.noRoads} body={t.overview.noRoadsBody} />}
      </TableCard>
    </>
  );
}
