#!/usr/bin/env node
// Import a GeoJSON road file (from fetch-osm-roads.mjs) into an organization through the
// import_road_segments RPC, signed in as an org owner or road engineer. Batches of 1000.
//
// Usage: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... RS_EMAIL=... RS_PASSWORD=... \
//        node scripts/osm/import-osm-roads.mjs --file datasets/osm/new-damietta-roads.geojson --org <org uuid> \
//             --city "New Damietta" --region Damietta
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !args.file || !args.org) { console.error('Need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, --file and --org'); process.exit(1); }
const fc = JSON.parse(readFileSync(args.file, 'utf8'));
const meta = fc.metadata ?? {};

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.RS_EMAIL, password: process.env.RS_PASSWORD }) });
if (!login.ok) { console.error('Sign-in failed', await login.text()); process.exit(1); }
const { access_token } = await login.json();

const features = fc.features.map((f) => ({ ...f.properties, coordinates: f.geometry.coordinates }));
let totals = { inserted: 0, updated: 0, skipped: 0 };
for (let i = 0; i < features.length; i += 1000) {
  const r = await fetch(`${url}/rest/v1/rpc/import_road_segments`, {
    method: 'POST', headers: { apikey: key, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_org: args.org, p_features: features.slice(i, i + 1000), p_source: `${meta.source ?? 'OpenStreetMap'} (OSM base ${meta.osm_base ?? 'unknown'})`,
      p_license: meta.license ?? 'ODbL-1.0', p_retrieved_at: meta.retrieved_at ?? new Date().toISOString(), p_city: args.city ?? null, p_region: args.region ?? null }),
  });
  const body = await r.json();
  if (!r.ok) { console.error(`Batch ${i / 1000 + 1} failed:`, body); process.exit(1); }
  totals = { inserted: totals.inserted + body.inserted, updated: totals.updated + body.updated, skipped: totals.skipped + body.skipped };
  console.log(`batch ${i / 1000 + 1}:`, body);
}
console.log('done', totals);
