'use client';
import { useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { importRoadBatch } from '@/lib/actions/importRoads';

type F = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][] | number[][][] } };
// Accepts Overpass/osmium/QGIS GeoJSON exports and our fetch-osm-roads.mjs output.
function toRows(fc: { features: F[] }) {
  const rows: Record<string, unknown>[] = [];
  for (const f of fc.features ?? []) {
    const pr = f.properties ?? {};
    const id = pr.osm_way_id ?? (typeof pr['@id'] === 'string' ? Number(String(pr['@id']).replace(/\D/g, '')) : pr['@id']) ?? (typeof pr.id === 'string' ? Number(String(pr.id).replace(/\D/g, '')) : pr.id);
    const lines = f.geometry?.type === 'LineString' ? [f.geometry.coordinates as number[][]] : f.geometry?.type === 'MultiLineString' ? (f.geometry.coordinates as number[][][]) : [];
    lines.forEach((coords, i) => rows.push({ osm_way_id: lines.length === 1 ? id : null, name: pr.name ?? null, name_ar: pr['name:ar'] ?? pr.name_ar ?? null, ref: pr.ref ?? null,
      highway: pr.highway ?? 'road', surface: pr.surface ?? null, lanes: pr.lanes ?? null, oneway: pr.oneway ?? null, coordinates: coords, _part: i }));
  }
  return rows.filter((r) => r.highway);
}

export function RoadImporter({ org, labels, errors }: { org: string; labels: Record<string, string>; errors: Record<string, string> }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [meta, setMeta] = useState({ source: 'OpenStreetMap', license: 'ODbL-1.0', retrieved: new Date().toISOString().slice(0, 16), city: '', region: '' });
  const [progress, setProgress] = useState<{ done: number; inserted: number; updated: number; skipped: number; error?: string; running: boolean } | null>(null);
  async function onFile(file: File) {
    try {
      const fc = JSON.parse(await file.text());
      setRows(toRows(fc));
      if (fc.metadata) setMeta((m) => ({ ...m, source: `${fc.metadata.source ?? m.source}${fc.metadata.osm_base ? ` (OSM base ${fc.metadata.osm_base})` : ''}`, license: fc.metadata.license ?? m.license, retrieved: String(fc.metadata.retrieved_at ?? m.retrieved).slice(0, 16) }));
    } catch { setRows([]); }
  }
  async function run() {
    if (!rows) return;
    const tot = { done: 0, inserted: 0, updated: 0, skipped: 0, running: true };
    setProgress({ ...tot });
    for (let i = 0; i < rows.length; i += 500) {
      const r = await importRoadBatch({ org, features: rows.slice(i, i + 500), source: meta.source, license: meta.license, retrievedAt: meta.retrieved, city: meta.city, region: meta.region });
      if (!r.ok) { setProgress({ ...tot, running: false, error: errors[r.error ?? 'generic'] ?? errors.generic }); return; }
      tot.done = Math.min(rows.length, i + 500); tot.inserted += r.inserted ?? 0; tot.updated += r.updated ?? 0; tot.skipped += r.skipped ?? 0;
      setProgress({ ...tot });
    }
    setProgress({ ...tot, running: false });
  }
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong bg-sunken px-6 py-10 text-center hover:border-accent">
        <Upload size={24} className="text-accent" /><span className="mt-2 text-sm font-[560]">{labels.file}</span><span className="text-xs text-ink-3">.geojson / .json</span>
        <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} data-testid="geojson-file" />
      </label>
      {rows ? <p className="text-sm"><span className="font-[600] tabular">{rows.length}</span> {labels.preview}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {([['source', labels.sourceName], ['license', labels.licence], ['city', labels.city], ['region', labels.region]] as const).map(([k, l]) => (
          <label key={k}><span className="mb-1.5 block text-[13px] font-[560]">{l}</span><input className="input" value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></label>))}
        <label><span className="mb-1.5 block text-[13px] font-[560]">{labels.retrieved}</span><input type="datetime-local" className="input" value={meta.retrieved} onChange={(e) => setMeta({ ...meta, retrieved: e.target.value })} /></label>
      </div>
      <button type="button" className="btn btn-primary" disabled={!rows?.length || progress?.running} onClick={run} data-testid="import-run">
        {progress?.running ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{labels.importCta}</button>
      {progress ? (
        <div className={`rounded-xl px-4 py-3 text-sm ${progress.error ? 'bg-crit-soft text-crit-text' : 'bg-ok-soft text-ok-text'}`} role="status" data-testid="import-status">
          {progress.error ? <p className="flex gap-2"><AlertTriangle size={16} />{progress.error}</p> : (
            <p className="flex items-center gap-2">{progress.running ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {progress.running ? `${labels.importing} ${progress.done}/${rows?.length}` : labels.done} · {progress.inserted} {labels.inserted} · {progress.updated} {labels.updated} · {progress.skipped} {labels.skipped}</p>)}
        </div>
      ) : null}
    </div>
  );
}
