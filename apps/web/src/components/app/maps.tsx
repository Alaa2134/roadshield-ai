'use client';
import type * as GeoJSON from 'geojson';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as maplibregl from 'maplibre-gl';
type StyleSpecification = maplibregl.StyleSpecification;
if (typeof window !== 'undefined') maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Layers, ArrowUpRight, Search } from 'lucide-react';
import { searchRoadsAction } from '@/lib/actions/search';
import { env } from '@/lib/env';
import { getRoadSummary } from '@/lib/actions/map';

export const CONDITION_COLORS: Record<string, string> = { unknown: '#8D99AB', good: '#12A879', fair: '#00B8A9', poor: '#F5A524', critical: '#E5484D' };
const BLANK: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EEF2F8' } }] };

async function resolveStyle(): Promise<{ style: StyleSpecification | string; ok: boolean }> {
  const dark = document.documentElement.dataset.theme === 'dark';
  const url = dark ? env.mapStyleDark : env.mapStyle;
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) throw new Error();
    return { style: url, ok: true };
  } catch {
    return { style: { ...BLANK, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#0B1A2F' : '#EEF2F8' } }] }, ok: false };
  }
}

function bboxOf(coords: number[][]): [[number, number], [number, number]] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of coords) { a = Math.min(a, x!); b = Math.min(b, y!); c = Math.max(c, x!); d = Math.max(d, y!); }
  return [[a, b], [c, d]];
}

export function RoadMiniMap({ geometry, condition, defects }: { geometry: GeoJSON.LineString; condition: string; defects: [number, number][] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: maplibregl.Map | null = null; let cancelled = false;
    resolveStyle().then(({ style }) => {
      if (cancelled || !ref.current) return;
      map = new maplibregl.Map({ container: ref.current, style, bounds: bboxOf(geometry.coordinates), fitBoundsOptions: { padding: 48, maxZoom: 17 }, attributionControl: { compact: true } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        map!.addSource('road', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry } });
        map!.addLayer({ id: 'road-casing', type: 'line', source: 'road', paint: { 'line-color': '#071629', 'line-width': 9, 'line-opacity': 0.25 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map!.addLayer({ id: 'road', type: 'line', source: 'road', paint: { 'line-color': CONDITION_COLORS[condition] ?? '#2878FF', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        defects.forEach(([lng, lat]) => new maplibregl.Marker({ color: '#E5484D', scale: 0.7 }).setLngLat([lng, lat]).addTo(map!));
      });
    });
    return () => { cancelled = true; map?.remove(); };
  }, [geometry, condition, defects]);
  return <div ref={ref} className="h-72 w-full bg-sunken" role="img" aria-label="Road location map" />;
}

type Labels = { layers: string; roads: string; defects: string; projects: string; filterCondition: string; select: string; open: string; tilesNote: string; noBasemap: string;
  conditions: Record<string, string>; km: string; inspections: string; defectsCount: string; hazards: string; search: string; colorBy: string; byCondition: string; bySpend: string;
  spendLegend: string; noSpend: string; currency: string };

const SPEND_RAMP = ['#cfe0ff', '#8db4ff', '#4a8dff', '#1f5fd6', '#0b3a8c']; // sequential, one hue

export function NetworkMap({ roads, defects, labels, center, orgId }: { roads: GeoJSON.FeatureCollection; defects: GeoJSON.FeatureCollection; labels: Labels; center: [number, number]; orgId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState(true);
  const [show, setShow] = useState({ roads: true, defects: true });
  const [conds, setConds] = useState<string[]>(['good', 'fair', 'poor', 'critical', 'unknown']);
  const [colorBy, setColorBy] = useState<'condition' | 'spend'>('condition');
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof getRoadSummary>> | 'loading' | null>(null);
  const [q, setQ] = useState('');
  const searchSeq = useRef(0);
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchRoadsAction>>>([]);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spends = roads.features.map((f) => Number((f.properties as { project_spend?: number | null })?.project_spend ?? NaN)).filter((v) => Number.isFinite(v) && v > 0);
  const maxSpend = spends.length ? Math.max(...spends) : 0;
  const canSpend = spends.length > 0;

  const select = async (id: string) => {
    const map = mapRef.current; if (!map) return;
    map.setFilter('roads-selected', ['==', ['get', 'id'], id]);
    setSelected('loading');
    const sum = await getRoadSummary(id);
    // project_spend comes from the (RLS-filtered) map feed, so it is only present for finance roles
    const props = roads.features.find((f) => (f.properties as { id?: string })?.id === id)?.properties as { project_spend?: number | null } | undefined;
    setSelected(sum ? { ...sum, road: { ...sum.road, project_spend: props?.project_spend ?? null } } : null);
  };

  useEffect(() => {
    let cancelled = false;
    resolveStyle().then(({ style, ok }) => {
      if (cancelled || !ref.current) return;
      setBasemap(ok);
      const coords = roads.features.flatMap((f) => (f.geometry as GeoJSON.LineString).coordinates);
      const map = new maplibregl.Map({ container: ref.current, style, ...(coords.length ? { bounds: bboxOf(coords), fitBoundsOptions: { padding: 40 } } : { center, zoom: 12 }), attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('load', () => {
        map.addSource('roads', { type: 'geojson', data: roads, promoteId: 'id' });
        map.addSource('defects', { type: 'geojson', data: defects, cluster: true, clusterRadius: 40, clusterMaxZoom: 15 });
        map.addLayer({ id: 'roads-hit', type: 'line', source: 'roads', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 } });
        map.addLayer({ id: 'roads-hover', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 13], 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.55, 0] } });
        map.addLayer({ id: 'roads', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['match', ['get', 'condition'], 'good', CONDITION_COLORS.good!, 'fair', CONDITION_COLORS.fair!, 'poor', CONDITION_COLORS.poor!, 'critical', CONDITION_COLORS.critical!, CONDITION_COLORS.unknown!],
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'highway'], ['primary', 'trunk', 'motorway', 'secondary'], 2.5, 1.2], 16, ['match', ['get', 'highway'], ['primary', 'trunk', 'motorway', 'secondary'], 8, 4.5]] } });
        map.addLayer({ id: 'roads-selected', type: 'line', source: 'roads', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#2878FF', 'line-width': 9, 'line-opacity': 0.45 } });
        map.addLayer({ id: 'defect-clusters', type: 'circle', source: 'defects', filter: ['has', 'point_count'],
          paint: { 'circle-color': '#E5484D', 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24] } });
        map.addLayer({ id: 'defect-count', type: 'symbol', source: 'defects', filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#fff' } });
        map.addLayer({ id: 'defects', type: 'circle', source: 'defects', filter: ['!', ['has', 'point_count']], paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
          'circle-color': ['match', ['get', 'severity'], 'critical', '#E5484D', 'high', '#E5484D', 'medium', '#F5A524', '#8D99AB'] } });
        let hovered: string | number | undefined;
        map.on('mousemove', 'roads-hit', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const id = e.features?.[0]?.id;
          if (hovered !== undefined && hovered !== id) map.setFeatureState({ source: 'roads', id: hovered }, { hover: false });
          if (id !== undefined) { hovered = id; map.setFeatureState({ source: 'roads', id }, { hover: true }); }
        });
        map.on('mouseleave', 'roads-hit', () => { map.getCanvas().style.cursor = ''; if (hovered !== undefined) map.setFeatureState({ source: 'roads', id: hovered }, { hover: false }); hovered = undefined; });
        map.on('click', 'roads-hit', (e) => { const id = e.features?.[0]?.properties?.id as string | undefined; if (id) void select(id); });
        map.on('click', 'defect-clusters', async (e) => {
          const f = e.features?.[0]; if (!f) return;
          const src = map.getSource('defects') as maplibregl.GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id as number);
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: reduce ? 0 : 600 });
        });
        map.on('mouseenter', 'defect-clusters', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'defect-clusters', () => (map.getCanvas().style.cursor = ''));
      });
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roads, defects, center]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !map.isStyleLoaded() || !map.getLayer('roads')) return;
    const f: maplibregl.FilterSpecification = ['in', ['get', 'condition'], ['literal', conds]];
    map.setFilter('roads', f); map.setFilter('roads-hit', f);
    map.setLayoutProperty('roads', 'visibility', show.roads ? 'visible' : 'none');
    for (const l of ['defects', 'defect-clusters', 'defect-count']) map.setLayoutProperty(l, 'visibility', show.defects ? 'visible' : 'none');
    map.setPaintProperty('roads', 'line-color', colorBy === 'spend' && maxSpend > 0
      ? ['case', ['>', ['coalesce', ['get', 'project_spend'], 0], 0],
          ['interpolate', ['linear'], ['get', 'project_spend'], 0, SPEND_RAMP[0]!, maxSpend * 0.25, SPEND_RAMP[1]!, maxSpend * 0.5, SPEND_RAMP[2]!, maxSpend * 0.75, SPEND_RAMP[3]!, maxSpend, SPEND_RAMP[4]!],
          '#5b6573']
      : ['match', ['get', 'condition'], 'good', CONDITION_COLORS.good!, 'fair', CONDITION_COLORS.fair!, 'poor', CONDITION_COLORS.poor!, 'critical', CONDITION_COLORS.critical!, CONDITION_COLORS.unknown!]);
  }, [conds, show, colorBy, maxSpend]);

  const flyTo = (h: (typeof hits)[number]) => {
    setHits([]); setQ(h.name ?? h.highway_class);
    mapRef.current?.flyTo({ center: [h.lon, h.lat], zoom: 16, duration: reduce ? 0 : 1400, essential: true });
    void select(h.id);
  };
  const fmtMoney = (v: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: labels.currency, currencyDisplay: 'code', notation: 'compact', maximumFractionDigits: 1 }).format(v);

  const s = selected && selected !== 'loading' ? selected : null;
  return (
    <div className="relative h-[calc(100dvh-11rem)] min-h-[520px] overflow-hidden rounded-[14px] border border-line bg-sunken shadow-soft">
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} data-testid="network-map" />
      <div className="absolute start-3 top-3 z-10 w-64">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute z-10 start-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={async (e) => { const v = e.target.value; setQ(v); const seq = ++searchSeq.current; const r = v.trim().length >= 1 ? await searchRoadsAction(orgId, v) : []; if (seq === searchSeq.current) setHits(r); }}
            placeholder={labels.search} aria-label={labels.search} data-testid="map-search"
            className="h-10 w-full rounded-xl border border-line bg-raised/95 ps-9 pe-3 text-[13px] shadow-card outline-none backdrop-blur focus:border-accent" />
        </div>
        {hits.length ? (
          <ul className="mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-float">
            {hits.map((h) => (
              <li key={h.id}><button type="button" onClick={() => flyTo(h)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-[13px] hover:bg-hover">
                <span className="truncate">{h.name ?? h.highway_class}</span><span className="size-2 shrink-0 rounded-full" style={{ background: CONDITION_COLORS[h.condition] }} /></button></li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 rounded-xl border border-line bg-raised/95 p-3 shadow-card backdrop-blur">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-[600]"><Layers size={13} />{labels.layers}</p>
          <label className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={show.roads} onChange={(e) => setShow({ ...show, roads: e.target.checked })} />{labels.roads}</label>
          <label className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={show.defects} onChange={(e) => setShow({ ...show, defects: e.target.checked })} />{labels.defects}</label>
          {canSpend ? (
            <>
              <p className="mt-2 mb-1.5 text-xs font-[600]">{labels.colorBy}</p>
              <div className="flex gap-1 rounded-lg bg-sunken p-0.5" role="radiogroup">
                {(['condition', 'spend'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={colorBy === k} onClick={() => setColorBy(k)}
                    className={`flex-1 rounded-md px-2 py-1 text-[12px] ${colorBy === k ? 'bg-surface font-[600] text-ink shadow-soft' : 'text-ink-2'}`}>{k === 'condition' ? labels.byCondition : labels.bySpend}</button>
                ))}
              </div>
            </>
          ) : null}
          {colorBy === 'spend' && canSpend ? (
            <div className="mt-2.5">
              <div className="flex h-2 overflow-hidden rounded-full">{SPEND_RAMP.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
              <div className="mt-1 flex justify-between text-[10.5px] text-ink-2 tabular"><span>0</span><span>{fmtMoney(maxSpend)}</span></div>
              <p className="mt-1 text-[10.5px] text-ink-3">{labels.spendLegend} · <span className="inline-block size-2 rounded-full bg-[#5b6573] align-middle" /> {labels.noSpend}</p>
            </div>
          ) : (
            <>
              <p className="mt-2 mb-1.5 text-xs font-[600]">{labels.filterCondition}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(CONDITION_COLORS).map((c) => {
                  const on = conds.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => setConds(on ? conds.filter((x) => x !== c) : [...conds, c])}
                      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] ${on ? 'border-line-strong bg-surface text-ink' : 'border-transparent bg-sunken text-ink-3'}`}>
                      <span className="size-2 rounded-full" style={{ background: CONDITION_COLORS[c], opacity: on ? 1 : 0.35 }} />{labels.conditions[c]}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {!basemap ? <p className="mt-3 text-[11px] text-warn-text">{labels.noBasemap}</p> : null}
        </div>
      </div>
      <aside className={`absolute inset-x-3 bottom-3 z-10 rounded-2xl border border-line bg-raised p-4 shadow-float transition-all sm:inset-x-auto sm:end-3 sm:top-3 sm:bottom-auto sm:w-80 ${selected ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
        aria-live="polite" data-testid="road-panel">
        {selected === 'loading' ? <div className="space-y-2"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-3 w-1/2" /><div className="skeleton h-16 w-full" /></div> : s ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-[620]">{String(s.road.name ?? s.road.highway_class)}</p>
                <p className="text-xs text-ink-2">{String(s.road.highway_class)} · {(Number(s.road.length_m) / 1000).toFixed(2)} {labels.km}</p>
              </div>
              <button type="button" className="btn btn-sm btn-ghost px-1.5" aria-label="Close" onClick={() => { setSelected(null); mapRef.current?.setFilter('roads-selected', ['==', ['get', 'id'], '']); }}><X size={15} /></button>
            </div>
            <span className="badge badge-dot mt-3" style={{ color: CONDITION_COLORS[String(s.road.condition)], background: `${CONDITION_COLORS[String(s.road.condition)]}1f` }}>{labels.conditions[String(s.road.condition)]}</span>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[[labels.inspections, s.inspections], [labels.defectsCount, s.defects], [labels.hazards, s.hazards]].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-sunken px-2 py-2"><dd className="text-[17px] font-[640] tabular">{String(v)}</dd><dt className="truncate text-[10.5px] text-ink-2">{String(k)}</dt></div>
              ))}
            </dl>
            {typeof s.road.project_spend === 'number' ? <p className="mt-3 text-xs text-ink-2">{labels.bySpend}: <span className="font-[600] text-ink tabular">{fmtMoney(s.road.project_spend as number)}</span></p> : null}
            {s.projects.length ? <ul className="mt-3 space-y-1 text-xs">{s.projects.map((p) => <li key={p.code} className="truncate"><span className="font-mono text-accent-text">{p.code}</span> · {p.name}</li>)}</ul> : null}
            <Link href={`/app/roads/${String(s.road.id)}`} className="btn btn-primary btn-sm mt-4 w-full">{labels.open}<ArrowUpRight size={14} className="flip-rtl" /></Link>
          </>
        ) : null}
      </aside>
      {!selected ? <p className="pointer-events-none absolute bottom-3 start-1/2 z-10 -translate-x-1/2 rounded-full bg-navy/80 px-3 py-1.5 text-xs text-white rtl:translate-x-1/2">{labels.select}</p> : null}
    </div>
  );
}
