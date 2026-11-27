import { stepOf } from '@/components/home/ReportCarousel';

describe('report progress track (home carousel)', () => {
  it('maps every workflow status to a step 0–4', () => {
    expect(stepOf('submitted')).toBe(0);
    expect(stepOf('under_review')).toBe(0);
    expect(stepOf('verified')).toBe(1);
    expect(stepOf('reopened')).toBe(1);
    expect(stepOf('assigned')).toBe(2);
    expect(stepOf('in_progress')).toBe(3);
    expect(stepOf('resolved')).toBe(4);
  });
  it('never returns a negative step for terminal states shown separately', () => {
    expect(stepOf('rejected')).toBeGreaterThanOrEqual(0);
    expect(stepOf('duplicate')).toBeGreaterThanOrEqual(0);
  });
});
