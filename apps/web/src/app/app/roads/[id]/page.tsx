import type * as GeoJSON from 'geojson';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, ClipboardCheck, TriangleAlert, FolderKanban, Wallet, FileText, Info, Plus } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money, num } from '@/lib/format';
import { Badge, ButtonLink, Card, CardHeader, DefinitionList, EmptyState, Notice, PageHeader, approvalTone, conditionTone, projectTone, severityTone } from '@/components/ui';
import { RoadMiniMap } from '@/components/app/maps';

type Detail = {
  road: Record<string, unknown> & { id: string; name: string | null; name_ar: string | null; condition: string; geometry: GeoJSON.LineString; length_m: number; highway_class: string };
  inspections: { id: string; inspected_at: string; condition: string; status: string; notes: string; inspector: string | null; defects: number }[];
  defects: { id: string; class: string; severity: string; length_m: number | null; width_m: number | null; depth_mm: number | null; area_m2: number | null; inspected_at: string }[];
  projects: { id: string; code: string; name: string; status: string; contractor: string | null; planned_start: string | null; planned_end: string | null; actual_end: string | null; verified_actual: number | null; currency: string }[];
  budgets: { id: string; label: string; fiscal_year: number; amount: number; currency: string; status: string }[] | null;
  citizen_hazards: { id: string; code: string; category: string; severity: string; status: string; created_at: string }[];
  documents: { id: string; filename: string; created_at: string }[];
};

export default async function RoadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('road_detail', { p_road: id });
  if (error || !data) notFound();
  const d = data as Detail; const r = d.road;
  const unknown = <span className="text-ink-3">{t.common.unknown}</span>;
  const name = (locale === 'ar' && r.name_ar) || r.name || `${r.highway_class} · ${String(r.osm_way_id ?? r.id).slice(0, 10)}`;
  return (
    <>
      <PageHeader title={name} eyebrow={<Link href="/app/roads" className="text-xs font-[560] text-accent-text">← {p.roads.title}</Link>}
        subtitle={`${p.roads.detail} · ${num(r.length_m, locale)} ${t.common.m} · ${r.highway_class}`}
        actions={<>
          <Badge tone={conditionTone(r.condition)} dot className="h-7 px-3 text-xs">{t.condition[r.condition as keyof typeof t.condition]}</Badge>
          {can.engineer(org.role) ? <ButtonLink href={`/app/projects/new?road=${r.id}`} icon={Plus} size="sm">{p.roads.project}</ButtonLink> : null}
        </>} />
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-5">
          <Card pad={false} className="overflow-hidden"><RoadMiniMap geometry={r.geometry} condition={r.condition} defects={[]} /></Card>
          <Card>
            <CardHeader title={p.roads.inspections} icon={ClipboardCheck} />
            {d.inspections.length ? (
              <ol className="relative space-y-4 border-s border-line ps-5">
                {d.inspections.map((i) => (
                  <li key={i.id} className="relative">
                    <span className="absolute -start-[25px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-accent" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-[560]">{date(i.inspected_at, locale)}</span>
                      <Badge tone={conditionTone(i.condition)}>{t.condition[i.condition as keyof typeof t.condition]}</Badge>
                      <Badge tone={approvalTone(i.status)}>{t.approval[i.status as keyof typeof t.approval]}</Badge>
                      <span className="text-xs text-ink-2">{i.inspector ?? '—'} · {i.defects} {p.inspections.defects}</span>
                    </div>
                    {i.notes ? <p className="mt-1 text-sm text-ink-2">{i.notes}</p> : null}
                  </li>
                ))}
              </ol>
            ) : <EmptyState compact icon={ClipboardCheck} title={t.empty.inspections} body={t.empty.inspectionsBody} />}
          </Card>
          <Card>
            <CardHeader title={p.roads.defects} icon={TriangleAlert} subtitle={`${d.defects.length}`} />
            {d.defects.length ? (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>{t.common.description}</th><th>{p.reports.severity}</th><th className="num">L (m)</th><th className="num">W (m)</th><th className="num">D (mm)</th><th className="num">{t.common.m2}</th><th>{t.common.date}</th></tr></thead>
                <tbody>{d.defects.map((x) => (
                  <tr key={x.id}><td>{t.defect[x.class as keyof typeof t.defect]}</td><td><Badge tone={severityTone(x.severity)}>{t.severity[x.severity as keyof typeof t.severity]}</Badge></td>
                    <td className="num">{num(x.length_m, locale, 2)}</td><td className="num">{num(x.width_m, locale, 2)}</td><td className="num">{num(x.depth_mm, locale, 1)}</td><td className="num">{num(x.area_m2, locale, 2)}</td><td className="text-xs text-ink-2">{date(x.inspected_at, locale)}</td></tr>))}</tbody>
              </table></div>
            ) : <p className="text-sm text-ink-2">{t.common.none}</p>}
          </Card>
          <Card>
            <CardHeader title={p.roads.maintenance} icon={FolderKanban} />
            {d.projects.length ? (
              <ul className="divide-y divide-line">
                {d.projects.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <Link href={`/app/projects/${x.id}`} className="font-mono text-xs text-accent-text hover:underline">{x.code}</Link>
                    <span className="min-w-0 flex-1 truncate">{x.name}</span>
                    <Badge tone={projectTone(x.status)} dot>{t.projectStatus[x.status as keyof typeof t.projectStatus]}</Badge>
                    <span className="text-xs text-ink-2">{x.contractor ?? '—'}</span>
                    {x.verified_actual !== null ? <span className="tabular text-xs">{money(x.verified_actual, x.currency, locale)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-2">{t.common.none}</p>}
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title={p.roads.gis} icon={MapPin} />
            <DefinitionList items={[
              { label: p.roads.osmWay, value: r.osm_way_id ? <a className="text-accent-text hover:underline" href={`https://www.openstreetmap.org/way/${r.osm_way_id}`} target="_blank" rel="noreferrer">{String(r.osm_way_id)}</a> : unknown, mono: true },
              { label: p.roads.ref, value: (r.ref as string) ?? unknown },
              { label: p.roads.class, value: r.highway_class, mono: true },
              { label: p.roads.length, value: `${num(r.length_m, locale)} ${t.common.m}` },
              { label: p.roads.lanes, value: r.lanes_osm != null ? String(r.lanes_osm) : unknown },
              { label: p.roads.surface, value: (r.surface_osm as string) ?? unknown },
              { label: p.roads.width, value: r.width_m != null ? `${num(r.width_m as number, locale, 2)} ${t.common.m}` : unknown },
              { label: p.roads.oneway, value: r.oneway == null ? unknown : r.oneway ? t.common.yes : t.common.no },
              { label: p.roads.responsible, value: locale === 'ar' && org.name_ar ? org.name_ar : org.name },
              { label: p.roads.city, value: (r.city as string) ?? unknown },
              { label: t.common.source, value: (r.source as string) },
              { label: t.common.license, value: (r.source_license as string) },
            ]} />
            <div className="mt-4"><Notice tone="blue" icon={Info}>{p.roads.unknownNote}</Notice></div>
          </Card>
          {d.budgets !== null ? (
            <Card>
              <CardHeader title={p.roads.budgets} icon={Wallet} />
              {d.budgets.length ? (
                <ul className="space-y-2 text-sm">{d.budgets.map((b) => <li key={b.id} className="flex items-center justify-between gap-3"><span className="truncate">{b.label} · FY{b.fiscal_year}</span><span className="flex items-center gap-2"><span className="tabular">{money(b.amount, b.currency, locale)}</span><Badge tone={approvalTone(b.status)}>{t.approval[b.status as keyof typeof t.approval]}</Badge></span></li>)}</ul>
              ) : <p className="text-sm text-ink-2">{t.common.none}</p>}
              <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2"><span className="font-[600] text-ink">{p.roads.forecast}: </span>{p.roads.forecastHint}</p>
            </Card>
          ) : null}
          <Card>
            <CardHeader title={p.roads.hazards} icon={TriangleAlert} />
            {d.citizen_hazards.length ? (
              <ul className="space-y-2 text-sm">{d.citizen_hazards.map((h) => <li key={h.id} className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{h.code}</span><span className="flex-1 truncate text-ink-2">{h.category}</span><Badge tone={severityTone(h.severity)}>{t.severity[h.severity as keyof typeof t.severity]}</Badge></li>)}</ul>
            ) : <p className="text-sm text-ink-2">{t.common.none}</p>}
          </Card>
          <Card>
            <CardHeader title={p.roads.documents} icon={FileText} />
            {d.documents.length ? <ul className="space-y-1.5 text-sm">{d.documents.map((x) => <li key={x.id}>{x.filename} <span className="text-xs text-ink-3">{date(x.created_at, locale)}</span></li>)}</ul> : <p className="text-sm text-ink-2">{t.common.none}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
