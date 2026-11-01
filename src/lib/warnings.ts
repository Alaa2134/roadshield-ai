import { distanceToPolyline, haversine } from './geo';
import type { RouteAssessment } from './routing';
import type { HazardSummary, LatLng } from './types';

export type ActiveWarning = { hazard: HazardSummary; distanceM: number };

/** A hazard is announced at most once per this period (anti-spam). */
export const WARNING_COOLDOWN_MS = 10 * 60_000;
/** Farther than this from the route we cannot tell what is "ahead", so we stay quiet. */
export const OFF_ROUTE_M = 80;

/**
 * Pure decision used by the foreground warning hook: the nearest verified hazard AHEAD of the
 * user on the selected route, within `thresholdM` of route distance. Hazards already passed
 * are never returned.
 */
export function nextWarning(
  here: LatLng,
  route: Pick<RouteAssessment, 'coordinates' | 'hazards'>,
  thresholdM: number,
): ActiveWarning | null {
  const me = distanceToPolyline(here, route.coordinates);
  if (me.distance > OFF_ROUTE_M) return null;
  let best: ActiveWarning | null = null;
  for (const rh of route.hazards) {
    const ahead = rh.alongM - me.along;
    if (ahead <= 0 || ahead > thresholdM) continue;
    const distanceM = Math.max(haversine(here, rh.hazard), ahead);
    if (!best || distanceM < best.distanceM) best = { hazard: rh.hazard, distanceM };
  }
  return best;
}

/** Returns true (and records the time) only if this hazard has not been announced recently. */
export function shouldAnnounce(hazardId: string, announced: Map<string, number>, now = Date.now()): boolean {
  const last = announced.get(hazardId);
  if (last !== undefined && now - last < WARNING_COOLDOWN_MS) return false;
  announced.set(hazardId, now);
  return true;
}
