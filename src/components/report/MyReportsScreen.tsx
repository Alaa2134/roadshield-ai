import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyReportsArt } from '@/components/illustrations';
import { HazardRow } from '@/components/report/HazardBits';
import { Segmented } from '@/components/ui/Controls';
import { EmptyState, Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { useMyReports } from '@/hooks/data';
import { errorMessage } from '@/lib/errors';

type Filter = 'all' | 'open' | 'resolved' | 'closed';

export function MyReportsScreen({ back }: { back?: boolean }) {
  const { t } = useTranslation();
  const reports = useMyReports();
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const all = reports.data ?? [];
    switch (filter) {
      case 'open':
        return all.filter((r) => !['resolved', 'rejected', 'duplicate'].includes(r.status));
      case 'resolved':
        return all.filter((r) => r.status === 'resolved');
      case 'closed':
        return all.filter((r) => r.status === 'rejected' || r.status === 'duplicate');
      default:
        return all;
    }
  }, [reports.data, filter]);

  return (
    <Screen back={back} title={t('reports.title')} refreshing={reports.isRefetching} onRefresh={() => void reports.refetch()}>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('reports.filterAll') },
          { value: 'open', label: t('reports.filterOpen') },
          { value: 'resolved', label: t('reports.filterResolved') },
          { value: 'closed', label: t('reports.filterClosed') },
        ]}
      />
      {reports.error ? <Notice tone="danger" text={errorMessage(reports.error)} action={{ label: t('common.retry'), onPress: () => void reports.refetch() }} /> : null}
      {reports.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : list.length === 0 ? (
        <EmptyState
          illustration={<EmptyReportsArt />}
          title={t('reports.empty')}
          action={{ label: t('reports.emptyCta'), icon: 'camera', onPress: () => router.push('/report/new') }}
        />
      ) : (
        list.map((r) => <HazardRow key={r.id} hazard={r} showStatus />)
      )}
    </Screen>
  );
}
