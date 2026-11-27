#!/usr/bin/env node
// Fetch real road geometry from OpenStreetMap (Overpass API) and write a GeoJSON FeatureCollection
// with provenance metadata. Data © OpenStreetMap contributors, licensed under ODbL 1.0.
//
// Usage: node scripts/osm/fetch-osm-roads.mjs --bbox 31.405,31.615,31.475,31.745 --out datasets/osm/new-damietta-roads.geojson
//        (bbox = south,west,north,east; default = New Damietta pilot area)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const bbox = (args.bbox ?? '31.405,31.615,31.475,31.745').split(',').map(Number);
const out = args.out ?? 'datasets/osm/new-damietta-roads.geojson';
const endpoint = args.endpoint ?? 'https://overpass-api.de/api/interpreter';
const classes = (args.classes ?? 'motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary,tertiary_link,unclassified,residential,living_street').split(',');

if (bbox.length !== 4 || bbox.some(Number.isNaN)) { console.error('Invalid --bbox'); process.exit(1); }
const query = `[out:json][timeout:120];way["highway"~"^(${classes.join('|')})$"](${bbox.join(',')});out tags geom;`;

const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'RoadShield-OSM-import/1.0' }, body: 'data=' + encodeURIComponent(query) });
if (!res.ok) { console.error(`Overpass error ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const raw = await res.text();
const data = JSON.parse(raw);
const retrievedAt = new Date().toISOString();

const features = data.elements.filter((e) => e.type === 'way' && e.geometry?.length >= 2).map((w) => ({
  type: 'Feature',
  properties: {
    osm_way_id: w.id, name: w.tags.name ?? w.tags['name:en'] ?? null, name_ar: w.tags['name:ar'] ?? null, ref: w.tags.ref ?? null,
    highway: w.tags.highway, surface: w.tags.surface ?? null, lanes: w.tags.lanes ?? null, oneway: w.tags.oneway ?? null,
  },
  geometry: { type: 'LineString', coordinates: w.geometry.map((p) => [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7))]) },
}));

const fc = {
  type: 'FeatureCollection',
  metadata: {
    source: 'OpenStreetMap via Overpass API', endpoint, query, bbox, retrieved_at: retrievedAt,
    license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', osm_base: data.osm3s?.timestamp_osm_base ?? null,
    response_sha256: createHash('sha256').update(raw).digest('hex'), feature_count: features.length,
  },
  features,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fc));
const byClass = features.reduce((a, f) => ((a[f.properties.highway] = (a[f.properties.highway] ?? 0) + 1), a), {});
console.log(`Wrote ${features.length} ways to ${out} (OSM base ${fc.metadata.osm_base})`);
console.log(byClass);
