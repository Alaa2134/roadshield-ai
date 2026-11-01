import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { EmptyMapArt } from '@/components/illustrations';
import { CategoryIcon, Chip, PriorityBadge, SeverityBadge, TaskStatusBadge, categoryIcon } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Controls';
import { EmptyState, Notice, SkeletonCard, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { assignHazard, officerQueue, type QueueScope } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { formatDate, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query';
import { HAZARD_CATEGORIES, type HazardCategory, type QueueItem } from '@/lib/types';
import { useSession } from '@/stores/session';
import { severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function QueueCard({ item, scope, onClaim, claiming }: { item: QueueItem; scope: QueueScope; onClaim: () => void; claiming: boolean }) {
  const { t } = useTranslation();
  const { p } = useTheme();
  const open = () => (item.task_id ? router.push(`/officer/task/${item.task_id}`) : router.push(`/hazard/${item.hazard_id}`));
  return (
    <Card onPress={open} style={{ padding: 14 }}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <CategoryIcon category={item.category} color={severityColor(p, item.severity)} size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="semibold" numberOfLines={1}>
              {item.public_code} · {t(`categories.${item.category}`)}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[item.address, item.city].filter(Boolean).join(' · ') || `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
            </Text>
          </View>
          {item.priority?.active ? (
            <View style={{ alignItems: 'center' }}>
              <Text variant="stat" style={{ fontSize: 22, color: item.priority.level === 'high' ? p.danger : item.priority.level === 'medium' ? p.warning : p.success }}>
                {item.priority_score}
              </Text>
              <Text variant="label" tone="faint">
                /100
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <SeverityBadge severity={item.severity} />
          {item.task_status ? <TaskStatusBadge status={item.task_status} /> : null}
          {item.priority?.active ? <PriorityBadge level={item.priority.level} score={item.priority_score} /> : null}
        </View>
        <Text variant="caption" tone="faint">
          {item.assignee_name ? `${t('officer.assignee', { name: item.assignee_name })} · ` : ''}
          {item.due_date ? `${t('officer.due', { date: formatDate(item.due_date) })} · ` : ''}
          {t('map.confirmations', { count: item.confirmations_count })} · {timeAgo(item.verified_at ?? item.created_at)}
        </Text>
        {scope === 'unassigned' ? <Button size="sm" icon="hand-right-outline" label={t('officer.claim')} onPress={onClaim} loading={claiming} /> : null}
      </View>
    </Card>
  );
}

export default function Work() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const role = useSession((s) => s.role);
  const [scope, setScope] = useState<QueueScope>('mine');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<HazardCategory | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const queue = useQuery({ queryKey: qk.queue(scope, debounced, category), queryFn: () => officerQueue(scope, debounced, category) });

  const claim = useMutation({
    mutationFn: (hazardId: string) => assignHazard(hazardId, null),
    onSuccess: (res) => {
      toast.success(t('officer.claimed'));
      void client.invalidateQueries({ queryKey: ['officer-queue'] });
      router.push(`/officer/task/${res.task_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const scopes: { value: QueueScope; label: string }[] = [
    { value: 'mine', label: t('officer.mine') },
    { value: 'unassigned', label: t('officer.unassigned') },
    ...(role === 'admin' ? [{ value: 'all_open' as const, label: t('officer.allOpen') }] : []),
    { value: 'history', label: t('officer.history') },
  ];

  return (
    <Screen title={t('officer.title')} refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()}>
      <Segmented value={scope} onChange={setScope} options={scopes} />
      <Input icon="search" placeholder={t('common.search')} value={search} onChangeText={setSearch} autoCapitalize="characters" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t('map.allCategories')} selected={!category} onPress={() => setCategory(null)} />
        {HAZARD_CATEGORIES.map((c) => (
          <Chip key={c} label={t(`categories.${c}`)} icon={categoryIcon[c]} selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Ionicons name="information-circle-outline" size={14} color="#8A9AB5" />
        <Text variant="caption" tone="faint" style={{ flex: 1 }}>
          {t('priority.disclaimer')}
        </Text>
      </View>
      {queue.error ? <Notice tone="danger" text={errorMessage(queue.error)} /> : null}
      {queue.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (queue.data ?? []).length === 0 ? (
        <EmptyState illustration={<EmptyMapArt />} title={t('officer.empty')} />
      ) : (
        (queue.data ?? []).map((item) => (
          <QueueCard
            key={`${item.hazard_id}-${item.task_id ?? 'none'}`}
            item={item}
            scope={scope}
            claiming={claim.isPending && claim.variables === item.hazard_id}
            onClaim={() => claim.mutate(item.hazard_id)}
          />
        ))
      )}
    </Screen>
  );
}
