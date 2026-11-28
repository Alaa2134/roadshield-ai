// Copies MapLibre's self-contained worker bundle into public/ so it is served same-origin
// (Turbopack does not resolve MapLibre's worker URL automatically).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/maplibre', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/maplibre/maplibre-gl-worker.mjs');
console.log('maplibre worker copied');
