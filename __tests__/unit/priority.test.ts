import { computePriority, factorShare, PRIORITY_WEIGHTS } from '@/lib/priority';
import type { HazardSeverity, ReportStatus } from '@/lib/types';
import fixture from '../fixtures/priority-server-cases.json';

type Case = {
  severity: HazardSeverity;
  confirmations: number;
  createdAt: string;
  trafficExposure: number | null;
  status: ReportStatus;
  at: string;
  expected: { score: number; level: string };
};

describe('priority engine (rs-priority-v1)', () => {
  it.each((fixture.cases as Case[]).map((c, i) => [i, c] as const))(
    'matches the database for case %i',
    (_i, c) => {
      const p = computePriority(c);
      expect({ score: p.score, level: p.level }).toEqual(c.expected);
    },
  );

  it('reproduces the documented examples', () => {
    expect(
      computePriority({ severity: 'high', confirmations: 2, createdAt: '2026-01-01T00:00:00Z', trafficExposure: null, status: 'verified', at: '2026-01-11T12:00:00Z' }).score,
    ).toBe(62);
    expect(
      computePriority({ severity: 'critical', confirmations: 5, createdAt: '2026-01-01T00:00:00Z', trafficExposure: 5, status: 'verified', at: '2026-03-01T00:00:00Z' }),
    ).toMatchObject({ score: 100, level: 'high', active: true });
  });

  it('is deterministic and bounded 0..100', () => {
    const input = { severity: 'medium' as const, confirmations: 99, createdAt: '2025-01-01', trafficExposure: 4, status: 'reopened' as const, at: '2026-10-31' };
    const a = computePriority(input);
    expect(computePriority(input)).toEqual(a);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it.each(['resolved', 'rejected', 'duplicate'] as const)('%s hazards are inactive with score 0', (status) => {
    const p = computePriority({ severity: 'critical', confirmations: 9, createdAt: '2026-01-01', trafficExposure: 5, status, at: '2026-06-01' });
    expect(p).toMatchObject({ score: 0, level: 'none', active: false, factors: [] });
  });

  it('drops traffic exposure from the weights when no data exists', () => {
    const p = computePriority({ severity: 'low', confirmations: 0, createdAt: '2026-01-01', trafficExposure: null, status: 'submitted', at: '2026-01-01' });
    const traffic = p.factors.find((f) => f.key === 'traffic_exposure')!;
    expect(traffic.weight).toBe(0);
    expect(traffic.score).toBeNull();
    const shares = factorShare(p);
    expect(shares.reduce((s, f) => s + f.percent, 0)).toBeGreaterThanOrEqual(99);
    expect(shares.find((f) => f.key === 'traffic_exposure')!.percent).toBe(0);
  });

  it('explains how each factor contributes to the score', () => {
    const p = computePriority({ severity: 'high', confirmations: 2, createdAt: '2026-01-01', trafficExposure: 3, status: 'assigned', at: '2026-01-16' });
    const points = factorShare(p).reduce((s, f) => s + f.points, 0);
    expect(Math.abs(points - p.score)).toBeLessThanOrEqual(1);
    const totalWeight = Object.values(PRIORITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBe(100);
  });
});
