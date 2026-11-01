import type { HazardSeverity, Priority, PriorityFactor, ReportStatus } from './types';

/**
 * Client mirror of the server priority engine `public.compute_priority` (model rs-priority-v1).
 * The server is authoritative; this copy exists so the scoring rules are unit-tested in the app
 * and documented in one readable place. Identical inputs always produce identical output.
 *
 *   score = Σ(weight_i × factor_i) / Σ(weight_i)        factor_i ∈ [0, 100]
 *
 *   severity           40   low 25 · medium 50 · high 75 · critical 100
 *   confirmations      20   20 per independent "still there" confirmation, capped at 100
 *   age                15   linear over 30 days, capped at 100
 *   traffic exposure   15   level 1..5 → 0..100; excluded (weight 0) when no data exists
 *   maintenance status 10   unassigned 100 · assigned 60 · in progress 30
 *
 *   level: ≥70 high · ≥40 medium · otherwise low. Resolved/rejected/duplicate → inactive (0).
 */
export const PRIORITY_WEIGHTS = {
  severity: 40,
  confirmations: 20,
  age_days: 15,
  traffic_exposure: 15,
  maintenance_status: 10,
} as const;

const SEVERITY_SCORE: Record<HazardSeverity, number> = { low: 25, medium: 50, high: 75, critical: 100 };

/** PostgreSQL round(): half away from zero. */
const pgRound = (n: number) => Math.sign(n) * Math.round(Math.abs(n));

export function computePriority(input: {
  severity: HazardSeverity;
  confirmations: number;
  createdAt: Date | string;
  trafficExposure: number | null;
  status: ReportStatus;
  at: Date | string;
}): Priority {
  const { severity, confirmations, trafficExposure, status } = input;
  if (status === 'resolved' || status === 'rejected' || status === 'duplicate') {
    return { model: 'rs-priority-v1', score: 0, level: 'none', active: false, factors: [] };
  }
  const created = new Date(input.createdAt).getTime();
  const at = new Date(input.at).getTime();

  const sSev = SEVERITY_SCORE[severity];
  const sConf = Math.min(100, Math.max(0, confirmations) * 20);
  const days = Math.max(0, Math.floor((at - created) / 86_400_000));
  const sAge = Math.min(100, pgRound((days * 100) / 30));
  const sTraffic = trafficExposure == null ? null : (trafficExposure - 1) * 25;
  const sMaint = status === 'assigned' ? 60 : status === 'in_progress' ? 30 : 100;

  const W = PRIORITY_WEIGHTS;
  const num =
    W.severity * sSev +
    W.confirmations * sConf +
    W.age_days * sAge +
    W.maintenance_status * sMaint +
    (sTraffic == null ? 0 : W.traffic_exposure * sTraffic);
  const den = W.severity + W.confirmations + W.age_days + W.maintenance_status + (sTraffic == null ? 0 : W.traffic_exposure);
  const score = pgRound(num / den);
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

  const factors: PriorityFactor[] = [
    { key: 'severity', input: severity, score: sSev, weight: W.severity },
    { key: 'confirmations', input: confirmations, score: sConf, weight: W.confirmations },
    { key: 'age_days', input: days, score: sAge, weight: W.age_days },
    { key: 'traffic_exposure', input: trafficExposure, score: sTraffic, weight: sTraffic == null ? 0 : W.traffic_exposure },
    { key: 'maintenance_status', input: status, score: sMaint, weight: W.maintenance_status },
  ];
  return { model: 'rs-priority-v1', score, level, active: true, factors };
}

/** Share of the final score contributed by each factor, in percent of total active weight. */
export function factorShare(priority: Priority): { key: PriorityFactor['key']; percent: number; points: number }[] {
  const total = priority.factors.reduce((s, f) => s + f.weight, 0) || 1;
  return priority.factors.map((f) => ({
    key: f.key,
    percent: Math.round((f.weight / total) * 100),
    points: f.score == null ? 0 : Math.round(((f.score * f.weight) / total) * 10) / 10,
  }));
}
