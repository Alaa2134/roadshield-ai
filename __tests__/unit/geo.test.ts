import { bboxOf, bearing, distanceToPolyline, haversine, headingDelta, pointToSegment, polylineLength } from '@/lib/geo';

const p = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('geo', () => {
  it('haversine: one degree of latitude ≈ 111.195 km', () => {
    expect(haversine(p(31, 31.6), p(32, 31.6))).toBeCloseTo(111_195, -1);
    expect(haversine(p(31.4, 31.6), p(31.4, 31.6))).toBe(0);
  });

  it('point to segment distance and projection', () => {
    const a = p(31.4, 31.6);
    const b = p(31.4, 31.61); // ~950 m east
    const mid = p(31.4009, 31.605); // ~100 m north of the midpoint
    const r = pointToSegment(mid, a, b);
    expect(r.t).toBeCloseTo(0.5, 2);
    expect(r.distance).toBeGreaterThan(90);
    expect(r.distance).toBeLessThan(110);
    expect(pointToSegment(p(31.4, 31.59), a, b).t).toBe(0); // clamped before the start
  });

  it('distance along a polyline', () => {
    const line = [p(31.4, 31.6), p(31.4, 31.61), p(31.41, 31.61)];
    const total = polylineLength(line);
    expect(total).toBeGreaterThan(2000);
    const atCorner = distanceToPolyline(p(31.4, 31.61), line);
    expect(atCorner.distance).toBeLessThan(1);
    expect(atCorner.along).toBeCloseTo(haversine(line[0]!, line[1]!), -1);
  });

  it('bbox with padding grows in every direction', () => {
    const tight = bboxOf([p(31.4, 31.6), p(31.42, 31.63)]);
    const padded = bboxOf([p(31.4, 31.6), p(31.42, 31.63)], 500);
    expect(padded.minLat).toBeLessThan(tight.minLat);
    expect(padded.maxLng).toBeGreaterThan(tight.maxLng);
  });

  it('bearing and heading difference', () => {
    expect(bearing(p(31, 31), p(32, 31))).toBeCloseTo(0, 0);
    expect(bearing(p(0, 0), p(0, 1))).toBeCloseTo(90, 0);
    expect(headingDelta(350, 10)).toBe(20);
    expect(headingDelta(10, 350)).toBe(20);
  });
});
