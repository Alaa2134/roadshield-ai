import { Linking, Platform } from 'react-native';
import { env } from './env';
import { distanceToPolyline, polylineLength } from './geo';
import type { HazardSeverity, HazardSummary, LatLng } from './types';

/**
 * Route preview through an OSRM-compatible routing service (EXPO_PUBLIC_ROUTING_URL).
 * Durations are the routing engine's own estimates (no live traffic). Nothing is invented:
 * if the service is unreachable the caller shows the "open in Maps" fallback instead.
 */
export type RouteOption = {
  index: number;
  coordinates: LatLng[];
  distanceM: number;
  durationS: number;
};

export type RouteHazard = { hazard: HazardSummary; alongM: number; offsetM: number };

export type RouteAssessment = RouteOption & {
  hazards: RouteHazard[];
  /** Severity-weighted verified hazards per 10 km of route. */
  exposure: number;
  exposureLevel: 'low' | 'medium' | 'high';
  counts: Record<HazardSeverity, number>;
};

export const ROUTE_CORRIDOR_M = 35;
const SEVERITY_WEIGHT: Record<HazardSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export async function fetchRoutes(from: LatLng, to: LatLng): Promise<RouteOption[]> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${env.routingUrl}/route/v1/driving/${coords}?alternatives=3&overview=full&geometries=geojson&steps=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`routing_http_${res.status}`);
    const body = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    if (body.code !== 'Ok' || !body.routes) {
      if (body.code === 'NoRoute') return [];
      throw new Error(`routing_${body.code}`);
    }
    return body.routes.map((r, index) => ({
      index,
      distanceM: r.distance,
      durationS: r.duration,
      coordinates: r.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    }));
  } finally {
    clearTimeout(timer);
  }
}

/** Finds verified hazards within the route corridor and computes exposure indicators. */
export function assessRoute(route: RouteOption, hazards: HazardSummary[], corridorM = ROUTE_CORRIDOR_M): RouteAssessment {
  const matches: RouteHazard[] = [];
  for (const hazard of hazards) {
    const { distance, along } = distanceToPolyline(hazard, route.coordinates);
    if (distance <= corridorM) matches.push({ hazard, alongM: along, offsetM: distance });
  }
  matches.sort((a, b) => a.alongM - b.alongM);
  const counts: Record<HazardSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let weighted = 0;
  for (const m of matches) {
    counts[m.hazard.severity] += 1;
    weighted += SEVERITY_WEIGHT[m.hazard.severity];
  }
  const km = Math.max(0.5, (route.distanceM || polylineLength(route.coordinates)) / 1000);
  const exposure = Math.round((weighted / km) * 10 * 10) / 10;
  const exposureLevel = exposure >= 8 ? 'high' : exposure >= 3 ? 'medium' : 'low';
  return { ...route, hazards: matches, exposure, exposureLevel, counts };
}

/** Opens turn-by-turn navigation in the platform maps app (Apple Maps or Google Maps). */
export async function openExternalNavigation(to: LatLng, app: 'apple' | 'google' = Platform.OS === 'ios' ? 'apple' : 'google') {
  const dest = `${to.latitude},${to.longitude}`;
  const url =
    app === 'apple'
      ? `http://maps.apple.com/?daddr=${dest}&dirflg=d`
      : Platform.OS === 'android'
        ? `google.navigation:q=${dest}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  try {
    if (await Linking.canOpenURL(url)) return Linking.openURL(url);
  } catch {
    // fall through
  }
  return Linking.openURL(fallback);
}

export function openInMaps(point: LatLng, label?: string) {
  const q = `${point.latitude},${point.longitude}`;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${q}&q=${encodeURIComponent(label ?? 'Hazard')}`
      : `geo:${q}?q=${q}(${encodeURIComponent(label ?? 'Hazard')})`;
  return Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`));
}
