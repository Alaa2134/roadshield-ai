import Link from 'next/link';
import { Activity, Info } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, num } from '@/lib/format';
import { Badge, EmptyState, Notice, PageHeader, TableCard, conditionTone } from '@/components/ui';

export const metadata = { title: 'Predictive Maintenance' };

export default async function Predictive() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data } = await sb.rpc('predictive_flags', { p_org: org.org_id, p_limit: 200 });
  const rows = (data ?? []) as { road_id: string; name: string | null; highway_class: string; length_m: number; condition: string; last_inspected: string | null; open_defects: number; nearby_hazards: number; has_active_project: boolean; flags: string[] }[];
  const flagLabel: Record<string, string> = { poor_no_project: p.predictive.poor, stale_inspection: p.predictive.stale, citizen_hazards: p.predictive.hazards, high_severity_defects: `${t.severity.high}/${t.severity.critical}` };
  return (
    <>
      <PageHeader title={p.predictive.title} subtitle={p.predictive.subtitle} />
      <div className="mb-4"><Notice tone="blue" icon={Info}>{p.predictive.basis}</Notice></div>
      <TableCard>
        {rows.length ? (
          <table className="table"><thead><tr><th>{t.common.name}</th><th>{p.roads.class}</th><th className="num">{p.roads.length}</th><th>{p.roads.condition}</th><th>{p.roads.assessed}</th><th>Flags</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.road_id}><td><Link className="text-accent-text hover:underline" href={`/app/roads/${r.road_id}`}>{r.name ?? r.highway_class}</Link></td><td className="font-mono text-xs">{r.highway_class}</td>
              <td className="num">{num(r.length_m, locale)} m</td><td><Badge tone={conditionTone(r.condition)} dot>{t.condition[r.condition as keyof typeof t.condition]}</Badge></td>
              <td className="text-xs">{date(r.last_inspected, locale)}</td><td><div className="flex flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} tone={f === 'stale_inspection' ? 'neutral' : 'amber'}>{flagLabel[f] ?? f}</Badge>)}</div></td></tr>)}</tbody></table>
        ) : <EmptyState icon={Activity} title={t.empty.generic} />}
      </TableCard>
    </>
  );
}
