'use client';
import type * as GeoJSON from 'geojson';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as maplibregl from 'maplibre-gl';
type StyleSpecification = maplibregl.StyleSpecification;
if (typeof window !== 'undefined') maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Layers, ArrowUpRight } from 'lucide-react';
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
  conditions: Record<string, string>; km: string; inspections: string; defectsCount: string; hazards: string };

export function NetworkMap({ roads, defects, labels, center }: { roads: GeoJSON.FeatureCollection; defects: GeoJSON.FeatureCollection; labels: Labels; center: [number, number] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState(true);
  const [show, setShow] = useState({ roads: true, defects: true });
  const [conds, setConds] = useState<string[]>(['good', 'fair', 'poor', 'critical', 'unknown']);
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof getRoadSummary>> | 'loading' | null>(null);

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
        map.addSource('roads', { type: 'geojson', data: roads });
        map.addSource('defects', { type: 'geojson', data: defects });
        map.addLayer({ id: 'roads-hit', type: 'line', source: 'roads', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 } });
        map.addLayer({ id: 'roads', type: 'line', source: 'roads', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['match', ['get', 'condition'], 'good', CONDITION_COLORS.good!, 'fair', CONDITION_COLORS.fair!, 'poor', CONDITION_COLORS.poor!, 'critical', CONDITION_COLORS.critical!, CONDITION_COLORS.unknown!],
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'highway'], ['primary', 'trunk', 'motorway', 'secondary'], 2.5, 1.2], 16, ['match', ['get', 'highway'], ['primary', 'trunk', 'motorway', 'secondary'], 8, 4.5]] } });
        map.addLayer({ id: 'roads-selected', type: 'line', source: 'roads', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#2878FF', 'line-width': 9, 'line-opacity': 0.45 } });
        map.addLayer({ id: 'defects', type: 'circle', source: 'defects', paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
          'circle-color': ['match', ['get', 'severity'], 'critical', '#E5484D', 'high', '#E5484D', 'medium', '#F5A524', '#8D99AB'] } });
        map.on('mouseenter', 'roads-hit', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'roads-hit', () => (map.getCanvas().style.cursor = ''));
        map.on('click', 'roads-hit', async (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (!id) return;
          map.setFilter('roads-selected', ['==', ['get', 'id'], id]);
          setSelected('loading');
          setSelected(await getRoadSummary(id));
        });
      });
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [roads, defects, center]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !map.isStyleLoaded() || !map.getLayer('roads')) return;
    const f: maplibregl.FilterSpecification = ['in', ['get', 'condition'], ['literal', conds]];
    map.setFilter('roads', f); map.setFilter('roads-hit', f);
    map.setLayoutProperty('roads', 'visibility', show.roads ? 'visible' : 'none');
    map.setLayoutProperty('defects', 'visibility', show.defects ? 'visible' : 'none');
  }, [conds, show]);

  const s = selected && selected !== 'loading' ? selected : null;
  return (
    <div className="relative h-[calc(100dvh-11rem)] min-h-[520px] overflow-hidden rounded-[14px] border border-line bg-sunken shadow-soft">
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} data-testid="network-map" />
      <div className="absolute start-3 top-3 z-10 w-60 rounded-xl border border-line bg-raised/95 p-3 shadow-card backdrop-blur">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-[600]"><Layers size={13} />{labels.layers}</p>
        <label className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={show.roads} onChange={(e) => setShow({ ...show, roads: e.target.checked })} />{labels.roads}</label>
        <label className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={show.defects} onChange={(e) => setShow({ ...show, defects: e.target.checked })} />{labels.defects}</label>
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
        {!basemap ? <p className="mt-3 text-[11px] text-warn-text">{labels.noBasemap}</p> : null}
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
            {s.projects.length ? <ul className="mt-3 space-y-1 text-xs">{s.projects.map((p) => <li key={p.code} className="truncate"><span className="font-mono text-accent-text">{p.code}</span> · {p.name}</li>)}</ul> : null}
            <Link href={`/app/roads/${String(s.road.id)}`} className="btn btn-primary btn-sm mt-4 w-full">{labels.open}<ArrowUpRight size={14} className="flip-rtl" /></Link>
          </>
        ) : null}
      </aside>
      {!selected ? <p className="pointer-events-none absolute bottom-3 start-1/2 z-10 -translate-x-1/2 rounded-full bg-navy/80 px-3 py-1.5 text-xs text-white rtl:translate-x-1/2">{labels.select}</p> : null}
    </div>
  );
}
