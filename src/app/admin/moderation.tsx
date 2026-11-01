import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { EmptyMapArt } from '@/components/illustrations';
import { CategoryIcon, PriorityBadge, SeverityBadge, StatusBadge } from '@/components/ui/Badges';
import { Card } from '@/components/ui/Card';
import { EmptyState, Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { moderationQueue } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query';
import { severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function Moderation() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const queue = useQuery({ queryKey: qk.moderation, queryFn: moderationQueue });

  return (
    <Screen back title={t('admin.moderation')} refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()}>
      {queue.error ? <Notice tone="danger" text={errorMessage(queue.error)} /> : null}
      {queue.isLoading ? (
        <SkeletonCard />
      ) : (queue.data ?? []).length === 0 ? (
        <EmptyState illustration={<EmptyMapArt />} title={t('admin.queueEmpty')} />
      ) : (
        (queue.data ?? []).map((h) => (
          <Card key={h.id} onPress={() => router.push(`/admin/hazard/${h.id}`)} style={{ padding: 14 }}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <CategoryIcon category={h.category} color={severityColor(p, h.severity)} size={44} />
                <View style={{ flex: 1 }}>
                  <Text weight="semibold">
                    {h.public_code} · {t(`categories.${h.category}`)}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {[h.address, h.city].filter(Boolean).join(' · ') || t('common.unknownPlace')} · {timeAgo(h.created_at)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <StatusBadge status={h.status} />
                <SeverityBadge severity={h.severity} />
                {h.priority?.active ? <PriorityBadge level={h.priority.level} score={h.priority.score} /> : null}
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
