import { screen } from '@testing-library/react-native';
import { PriorityExplainer, StatusTimeline } from '@/components/report/HazardBits';
import { PriorityBadge } from '@/components/ui/Badges';
import { computePriority } from '@/lib/priority';
import type { StatusEvent } from '@/lib/types';
import { renderWithProviders } from '../utils/render';

const ev = (id: number, from: StatusEvent['from_status'], to: StatusEvent['to_status'], note: string | null = null): StatusEvent => ({
  id,
  hazard_id: 'h1',
  from_status: from,
  to_status: to,
  note,
  created_at: `2026-10-${10 + id}T09:30:00Z`,
});

describe('report tracking timeline', () => {
  it('shows every main stage with its real timestamp and staff note', async () => {
    await renderWithProviders(
      <StatusTimeline
        current="verified"
        events={[ev(1, null, 'submitted'), ev(2, 'submitted', 'under_review'), ev(3, 'under_review', 'verified', 'Confirmed on site')]}
      />,
    );
    for (const label of ['Submitted', 'Under review', 'Verified', 'Assigned', 'In progress', 'Resolved']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('“Confirmed on site”')).toBeTruthy();
  });

  it('lists side states such as Rejected or Reopened separately', async () => {
    await renderWithProviders(
      <StatusTimeline current="reopened" events={[ev(1, null, 'submitted'), ev(2, 'submitted', 'resolved'), ev(3, 'resolved', 'reopened', 'Back after rain')]} />,
    );
    expect(screen.getByText('Reopened')).toBeTruthy();
    expect(screen.getByText('“Back after rain”')).toBeTruthy();
  });

  it('renders in Arabic', async () => {
    await renderWithProviders(<StatusTimeline current="submitted" events={[ev(1, null, 'submitted')]} />, 'ar');
    expect(screen.queryByText('Submitted')).toBeNull();
  });
});

describe('priority display', () => {
  const p = computePriority({ severity: 'high', confirmations: 2, createdAt: '2026-01-01', trafficExposure: null, status: 'verified', at: '2026-01-11T12:00:00Z' });

  it('badge shows level and score; inactive hazards show nothing', async () => {
    await renderWithProviders(<PriorityBadge level={p.level} score={p.score} />);
    expect(screen.getByText(/Medium.*62/)).toBeTruthy();
    const empty = await renderWithProviders(<PriorityBadge level="none" score={0} />);
    expect(empty.toJSON()).toBeNull();
  });

  it('explains the score and separates it from accident prediction', async () => {
    await renderWithProviders(<PriorityExplainer priority={p} />);
    expect(screen.getByText(/62/)).toBeTruthy();
    expect(screen.getByText(/not an accident prediction|does not predict accidents/i)).toBeTruthy();
  });
});
