import type { LatLng } from './types';

const R = 6371008.8; // mean Earth radius (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Local equirectangular projection around a reference latitude (accurate at street scale). */
function project(p: LatLng, refLat: number): [number, number] {
  return [rad(p.longitude) * R * Math.cos(rad(refLat)), rad(p.latitude) * R];
}

/**
 * Distance from point P to segment AB in metres, plus the fraction t (0..1) along AB of the
 * closest point.
 */
export function pointToSegment(p: LatLng, a: LatLng, b: LatLng): { distance: number; t: number } {
  const ref = (a.latitude + b.latitude) / 2;
  const [px, py] = project(p, ref);
  const [ax, ay] = project(a, ref);
  const [bx, by] = project(b, ref);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { distance: Math.hypot(px - cx, py - cy), t };
}

/**
 * Closest approach of a point to a polyline: distance (m) and distance along the line (m) at
 * which that closest point occurs.
 */
export function distanceToPolyline(p: LatLng, line: LatLng[]): { distance: number; along: number } {
  if (line.length === 0) return { distance: Infinity, along: 0 };
  if (line.length === 1) return { distance: haversine(p, line[0]!), along: 0 };
  let best = Infinity;
  let bestAlong = 0;
  let travelled = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const segLen = haversine(a, b);
    const { distance, t } = pointToSegment(p, a, b);
    if (distance < best) {
      best = distance;
      bestAlong = travelled + t * segLen;
    }
    travelled += segLen;
  }
  return { distance: best, along: bestAlong };
}

export function polylineLength(line: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += haversine(line[i]!, line[i + 1]!);
  return total;
}

export type BBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function bboxOf(points: LatLng[], padMeters = 0): BBox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const dLat = padMeters / 111_320;
  const midLat = (minLat + maxLat) / 2;
  const dLng = padMeters / (111_320 * Math.max(0.01, Math.cos(rad(midLat))));
  return { minLat: minLat - dLat, minLng: minLng - dLng, maxLat: maxLat + dLat, maxLng: maxLng + dLng };
}

export function regionToBBox(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }): BBox {
  return {
    minLat: r.latitude - r.latitudeDelta / 2,
    maxLat: r.latitude + r.latitudeDelta / 2,
    minLng: r.longitude - r.longitudeDelta / 2,
    maxLng: r.longitude + r.longitudeDelta / 2,
  };
}

/** Initial bearing from a to b in degrees (0 = north). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x =
    Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) -
    Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest absolute difference between two headings in degrees. */
export function headingDelta(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}
