import { assessRoute, type RouteOption } from '@/lib/routing';
import type { HazardSummary } from '@/lib/types';
import { nextWarning, shouldAnnounce, WARNING_COOLDOWN_MS } from '@/lib/warnings';

const hazard = (id: string, latitude: number, longitude: number, severity: HazardSummary['severity'] = 'high') =>
  ({ id, latitude, longitude, severity, category: 'pothole', status: 'verified' }) as unknown as HazardSummary;

// A straight ~1.9 km road running east through New Damietta.
const road: RouteOption = {
  index: 0,
  distanceM: 1900,
  durationS: 180,
  coordinates: [
    { latitude: 31.42, longitude: 31.65 },
    { latitude: 31.42, longitude: 31.67 },
  ],
};

describe('route assessment', () => {
  const near = hazard('near', 31.4201, 31.655); // ~11 m off the road, ~475 m along
  const far = hazard('far', 31.4201, 31.665); // ~1.4 km along
  const offRoad = hazard('off', 31.425, 31.66); // ~550 m away from the road

  it('keeps only hazards inside the corridor, ordered along the route', () => {
    const r = assessRoute(road, [far, offRoad, near]);
    expect(r.hazards.map((h) => h.hazard.id)).toEqual(['near', 'far']);
    expect(r.counts.high).toBe(2);
    expect(r.exposure).toBeGreaterThan(0);
  });

  it('a route with no hazards has zero exposure', () => {
    const r = assessRoute(road, [offRoad]);
    expect(r).toMatchObject({ exposure: 0, exposureLevel: 'low' });
  });

  describe('foreground warnings', () => {
    const route = assessRoute(road, [near, far]);
    it('warns about the next hazard ahead within the threshold', () => {
      const w = nextWarning({ latitude: 31.42, longitude: 31.652 }, route, 300);
      expect(w?.hazard.id).toBe('near');
      expect(w!.distanceM).toBeGreaterThan(200);
      expect(w!.distanceM).toBeLessThan(320);
    });
    it('stays quiet when the hazard is beyond the threshold', () => {
      expect(nextWarning({ latitude: 31.42, longitude: 31.65 }, route, 300)).toBeNull();
    });
    it('never warns about a hazard already passed', () => {
      const w = nextWarning({ latitude: 31.42, longitude: 31.6565 }, route, 300);
      expect(w).toBeNull();
    });
    it('stays quiet when the user is off the route', () => {
      expect(nextWarning({ latitude: 31.43, longitude: 31.652 }, route, 5000)).toBeNull();
    });
  });

  it('announces each hazard at most once per cooldown', () => {
    const seen = new Map<string, number>();
    expect(shouldAnnounce('h1', seen, 1_000)).toBe(true);
    expect(shouldAnnounce('h1', seen, 2_000)).toBe(false);
    expect(shouldAnnounce('h2', seen, 2_000)).toBe(true);
    expect(shouldAnnounce('h1', seen, 1_000 + WARNING_COOLDOWN_MS)).toBe(true);
  });
});
