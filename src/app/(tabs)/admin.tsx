import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Circle } from 'react-native-maps';
import { BarList, Donut, LineChart } from '@/components/charts';
import { HazardMap } from '@/components/map/HazardMap';
import { Card } from '@/components/ui/Card';
import { AnimatedStat, Divider, ListRow, Segmented } from '@/components/ui/Controls';
import { Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { adminMetrics, priorityHeatmap } from '@/lib/api/staff';
import { DEMO_REGION } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatNumber, hoursLabel, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query';
import { bboxOf } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORY_COLORS = ['#287BFF', '#00D6FF', '#FF9B35', '#F04452', '#13C48A', '#A78BFA', '#F6C945', '#8A9AB5'];

export default function AdminCommandCenter() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const metrics = useQuery({ queryKey: qk.metrics(Number(days)), queryFn: () => adminMetrics(Number(days)) });
  const heat = useQuery({ queryKey: qk.heatmap, queryFn: () => priorityHeatmap(0.005) });
  const m = metrics.data;

  const heatRegion = (() => {
    const cells = heat.data ?? [];
    if (cells.length === 0) return { ...DEMO_REGION };
    const b = bboxOf(cells, 400);
    return {
      latitude: (b.minLat + b.maxLat) / 2,
      longitude: (b.minLng + b.maxLng) / 2,
      latitudeDelta: Math.max(0.02, b.maxLat - b.minLat),
      longitudeDelta: Math.max(0.02, b.maxLng - b.minLng),
    };
  })();

  return (
    <Screen title={t('admin.title')} subtitle={m ? `${t('common.lastUpdated', { time: timeAgo(m.generated_at) })}` : undefined} refreshing={metrics.isRefetching} onRefresh={() => { void metrics.refetch(); void heat.refetch(); }}>
      <Card padded={false}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          <ListRow icon="shield-checkmark-outline" title={t('admin.moderation')} value={m ? formatNumber(m.totals.pending_verification) : undefined} onPress={() => router.push('/admin/moderation')} />
          <Divider />
          <ListRow icon="construct-outline" iconColor={p.cyan} title={t('officer.allOpen')} onPress={() => router.push('/(tabs)/work')} />
          <Divider />
          <ListRow icon="people-outline" iconColor={p.success} title={t('admin.users')} value={m ? formatNumber(m.users.total) : undefined} onPress={() => router.push('/admin/users')} />
          <Divider />
          <ListRow icon="megaphone-outline" iconColor={p.warning} title={t('admin.announce')} onPress={() => router.push('/admin/announce')} />
          <Divider />
          <ListRow icon="receipt-outline" iconColor={p.textMuted} title={t('admin.audit')} onPress={() => router.push('/admin/audit')} />
        </View>
      </Card>

      <Segmented
        value={days}
        onChange={setDays}
        options={[
          { value: '7', label: t('admin.period', { days: 7 }) },
          { value: '30', label: t('admin.period', { days: 30 }) },
          { value: '90', label: t('admin.period', { days: 90 }) },
        ]}
      />

      {metrics.error ? <Notice tone="danger" text={errorMessage(metrics.error)} /> : null}
      {metrics.isLoading || !m ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AnimatedStat value={m.totals.total_reports} label={t('admin.totalReports')} color={p.primary} />
              <AnimatedStat value={m.totals.active_hazards} label={t('admin.activeHazards')} color={p.warning} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <AnimatedStat value={m.totals.pending_verification} label={t('admin.pending')} color={p.cyan} />
              <AnimatedStat value={m.totals.resolved} label={t('admin.resolved')} color={p.success} />
            </View>
          </Card>

          <Section title={t('admin.resolution')}>
            <Card>
              {m.resolution_hours.count === 0 ? (
                <Text tone="muted">{t('admin.noResolved')}</Text>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {(
                    [
                      ['median', m.resolution_hours.median],
                      ['average', m.resolution_hours.avg],
                      ['p90', m.resolution_hours.p90],
                    ] as const
                  ).map(([k, v]) => (
                    <View key={k} style={{ alignItems: 'center', flex: 1 }}>
                      <Text variant="heading">{hoursLabel(v)}</Text>
                      <Text variant="caption" tone="muted">
                        {t(`admin.${k}`)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </Section>

          <Section title={t('admin.trend')}>
            <Card>
              <LineChart
                labels={m.daily.map((d) => formatDate(d.day))}
                series={[
                  { label: t('admin.reported'), color: p.primary, values: m.daily.map((d) => d.reported) },
                  { label: t('admin.resolved'), color: p.success, values: m.daily.map((d) => d.resolved) },
                ]}
              />
            </Card>
          </Section>

          <Section title={t('admin.priorityMix')}>
            <Card>
              <Donut
                centerLabel={t('admin.activeHazards')}
                segments={[
                  { key: 'high', label: t('priority.high'), value: m.priority_levels.high, color: p.danger },
                  { key: 'medium', label: t('priority.medium'), value: m.priority_levels.medium, color: p.warning },
                  { key: 'low', label: t('priority.low'), value: m.priority_levels.low, color: p.success },
                ]}
              />
            </Card>
          </Section>

          <Section title={t('admin.byCategory')}>
            <Card>
              {m.by_category.length === 0 ? (
                <Text tone="muted">{t('admin.noData')}</Text>
              ) : (
                <BarList items={m.by_category.map((c, i) => ({ key: c.category, label: t(`categories.${c.category}`), value: c.count, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))} />
              )}
            </Card>
          </Section>

          <Section title={t('admin.byRegion')}>
            <Card>
              {m.by_region.length === 0 ? (
                <Text tone="muted">{t('admin.noData')}</Text>
              ) : (
                <BarList color={p.cyan} items={m.by_region.map((r) => ({ key: r.region, label: r.region === 'unknown' ? t('admin.regionUnknown') : r.region, value: r.count }))} />
              )}
            </Card>
          </Section>

          <Section title={t('admin.workload')}>
            <Card>
              {m.workload.length === 0 ? (
                <Text tone="muted">{t('admin.noData')}</Text>
              ) : (
                m.workload.map((w, i) => (
                  <View key={w.officer_id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: p.border, gap: 6 }}>
                    <Text weight="semibold">{w.name || '—'}</Text>
                    <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                      <Text variant="caption" tone="muted">
                        {t('taskStatus.assigned')}: {w.assigned}
                      </Text>
                      <Text variant="caption" tone="cyan">
                        {t('taskStatus.in_progress')}: {w.in_progress}
                      </Text>
                      <Text variant="caption" tone="warning">
                        {t('taskStatus.completion_requested')}: {w.completion_requested}
                      </Text>
                      <Text variant="caption" tone="success">
                        {t('taskStatus.completed')}: {w.completed_in_period}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </Section>
        </>
      )}

      <Section title={t('admin.heatmap')}>
        <View style={{ height: 260, borderRadius: 22, overflow: 'hidden' }}>
          {heat.isLoading ? (
            <SkeletonCard lines={4} />
          ) : (
            <HazardMap key={`${heatRegion.latitude}-${heatRegion.longitude}`} hazards={[]} cluster={false} showsUserLocation={false} initialRegion={heatRegion}>
              {(heat.data ?? []).map((c) => {
                const color = c.avg_priority >= 70 ? p.danger : c.avg_priority >= 40 ? p.warning : p.success;
                return (
                  <Circle
                    key={`${c.latitude}-${c.longitude}`}
                    center={{ latitude: c.latitude, longitude: c.longitude }}
                    radius={120 + Math.min(10, c.hazard_count) * 25}
                    fillColor={color + '55'}
                    strokeColor={color}
                    strokeWidth={1}
                  />
                );
              })}
            </HazardMap>
          )}
        </View>
        <Text variant="caption" tone="faint">
          {t('priority.disclaimer')}
        </Text>
      </Section>
    </Screen>
  );
}
