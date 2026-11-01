import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { auditLogs } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { qk } from '@/lib/query';
import { useTheme } from '@/theme/ThemeProvider';

export default function Audit() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const logs = useInfiniteQuery({
    queryKey: qk.audit,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => auditLogs(pageParam),
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1]?.id : undefined),
  });
  const rows = logs.data?.pages.flat() ?? [];

  return (
    <Screen back title={t('admin.audit')} refreshing={logs.isRefetching} onRefresh={() => void logs.refetch()}>
      {logs.error ? <Notice tone="danger" text={errorMessage(logs.error)} /> : null}
      {logs.isLoading ? (
        <SkeletonCard />
      ) : (
        <Card padded={false}>
          {rows.map((r, i) => (
            <View key={r.id} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: p.border, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text weight="semibold" style={{ writingDirection: 'ltr' }}>
                  {r.action}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatDateTime(r.created_at)}
                </Text>
              </View>
              <Text variant="caption" tone="muted" style={{ writingDirection: 'ltr' }}>
                {r.entity_type} {r.entity_id ? `· ${r.entity_id.slice(0, 8)}` : ''} {r.actor_id ? `· actor ${r.actor_id.slice(0, 8)}` : ''}
              </Text>
              {Object.keys(r.details ?? {}).length ? (
                <Text variant="caption" tone="faint" numberOfLines={3} style={{ writingDirection: 'ltr' }}>
                  {JSON.stringify(r.details)}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      )}
      {logs.hasNextPage ? <Button variant="secondary" label={t('common.seeAll')} onPress={() => void logs.fetchNextPage()} loading={logs.isFetchingNextPage} /> : null}
    </Screen>
  );
}
