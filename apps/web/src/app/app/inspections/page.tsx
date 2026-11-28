import Link from 'next/link';
import { ScanLine, Sparkles } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, num } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, TableCard, Tabs, approvalTone, conditionTone } from '@/components/ui';
import { ReviewButtons } from '@/components/app/RpcForm';

export const metadata = { title: 'Inspections' };

export default async function Inspections({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { org, user } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const { status = 'submitted' } = await searchParams;
  const sb = await supabaseServer();
  const [{ data }, { data: counts }, { data: ai }] = await Promise.all([
    sb.from('road_inspections').select('id, road_id, inspector_id, inspected_at, condition, notes, status').eq('org_id', org.org_id).eq('status', status).order('inspected_at', { ascending: false }).limit(100),
    sb.from('road_inspections').select('status').eq('org_id', org.org_id),
    sb.from('ai_detections').select('id, model_name, model_version, top_category, top_confidence, analyzed_at, user_accepted_category').order('analyzed_at', { ascending: false }).limit(10),
  ]);
  const rows = (data ?? []) as { id: string; road_id: string; inspector_id: string | null; inspected_at: string; condition: string; notes: string; status: string }[];
  const roadIds = [...new Set(rows.map((r) => r.road_id))];
  const { data: roads } = roadIds.length ? await sb.from('road_segments').select('id, name, highway_class').in('id', roadIds) : { data: [] };
  const rn = new Map(((roads ?? []) as { id: string; name: string | null; highway_class: string }[]).map((r) => [r.id, r.name ?? r.highway_class]));
  const c = ((counts ?? []) as { status: string }[]).reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {} as Record<string, number>);
  return (
    <>
      <PageHeader title={p.inspections.title} subtitle={p.inspections.subtitle} />
      <Tabs active={status} items={(['submitted', 'approved', 'rejected'] as const).map((s) => ({ key: s, href: `/app/inspections?status=${s}`, label: p.inspections[s === 'submitted' ? 'pending' : s], count: c[s] ?? 0 }))} />
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <TableCard>
          {rows.length ? (
            <table className="table"><thead><tr><th>{p.inspections.road}</th><th>{p.inspections.when}</th><th>{p.roads.condition}</th><th>{t.common.notes}</th><th>{t.common.status}</th><th /></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}><td><Link href={`/app/roads/${r.road_id}`} className="text-accent-text hover:underline">{rn.get(r.road_id) ?? '—'}</Link></td>
                  <td className="text-xs whitespace-nowrap">{date(r.inspected_at, locale, true)}</td>
                  <td><Badge tone={conditionTone(r.condition)} dot>{t.condition[r.condition as keyof typeof t.condition]}</Badge></td>
                  <td className="max-w-72 truncate text-ink-2">{r.notes || '—'}</td>
                  <td><Badge tone={approvalTone(r.status)}>{t.approval[r.status as keyof typeof t.approval]}</Badge></td>
                  <td>{r.status === 'submitted' && can.engineer(org.role) && r.inspector_id !== user.id ? <ReviewButtons rpc="review_inspection" id={r.id} t={t} revalidate="/app/inspections" withNote testId="review-inspection" /> : null}</td></tr>))}</tbody></table>
          ) : <EmptyState icon={ScanLine} title={t.empty.inspections} body={t.empty.inspectionsBody} />}
        </TableCard>
        <Card>
          <CardHeader title={p.inspections.aiDetections} icon={Sparkles} />
          <Notice tone="blue">{p.inspections.aiNote}</Notice>
          <ul className="mt-4 divide-y divide-line">
            {((ai ?? []) as { id: string; model_version: string; top_category: string | null; top_confidence: number | null; analyzed_at: string }[]).map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm"><span className="flex-1">{a.top_category ?? '—'}</span><span className="tabular text-ink-2">{a.top_confidence !== null ? `${num(a.top_confidence * 100, locale, 0)}%` : '—'}</span><span className="text-xs text-ink-3">{date(a.analyzed_at, locale)}</span></li>
            ))}
            {!(ai ?? []).length ? <li className="py-3 text-sm text-ink-2">{t.common.none}</li> : null}
          </ul>
        </Card>
      </div>
    </>
  );
}
