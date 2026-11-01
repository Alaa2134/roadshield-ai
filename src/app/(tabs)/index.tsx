import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { HazardRow } from '@/components/report/HazardBits';
import { StatusBadge } from '@/components/ui/Badges';
import { IconButton, type IconName } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AnimatedStat } from '@/components/ui/Controls';
import { Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDrafts, useMyActivity, useMyLocation, useMyStats, useNearbyHazards, useUnread } from '@/hooks/data';
import { formatDistance, timeAgo } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { requestLocationPermission } from '@/lib/location';
import { processQueue } from '@/lib/offline/sync';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

const RADIUS = 2000;
const TIPS: { key: string; icon: IconName }[] = [
  { key: 'tip1', icon: 'car-outline' },
  { key: 'tip2', icon: 'rainy-outline' },
  { key: 'tip3', icon: 'resize-outline' },
  { key: 'tip4', icon: 'eye-off-outline' },
];

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? 'home.greetingMorning' : h < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening';
}

function QuickAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  const { p } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 20,
        backgroundColor: p.surface,
        borderWidth: 1,
        borderColor: p.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text variant="caption" weight="semibold" center numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const { width } = useWindowDimensions();
  const client = useQueryClient();
  const profile = useSession((s) => s.profile);
  const loc = useMyLocation();
  const nearby = useNearbyHazards(loc.position?.latitude, loc.position?.longitude, RADIUS);
  const stats = useMyStats();
  const activity = useMyActivity();
  const unread = useUnread();
  const { pending } = useDrafts();
  const [refreshing, setRefreshing] = useState(false);

  const hazards = nearby.data?.hazards ?? [];
  const high = hazards.filter((h) => h.priority?.level === 'high').length;
  const nearest = hazards[0]?.distance_m;
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || t('home.friend');

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loc.refresh(), client.invalidateQueries(), processQueue(true)]);
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {t(greetingKey())}
          </Text>
          <Text variant="title" numberOfLines={1}>
            {firstName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Ionicons
              name={loc.permission === 'granted' ? 'navigate' : 'navigate-outline'}
              size={13}
              color={loc.permission === 'granted' ? p.cyan : p.textFaint}
            />
            <Text variant="caption" tone={loc.permission === 'granted' ? 'cyan' : 'faint'} numberOfLines={1}>
              {loc.permission !== 'granted'
                ? t('home.locationOff')
                : loc.city ?? (loc.loading ? t('home.locating') : t('common.unknownPlace'))}
            </Text>
          </View>
        </View>
        <IconButton icon="map-outline" label={t('route.title')} onPress={() => router.push('/route')} />
        <IconButton
          icon="notifications-outline"
          label={t('notifications.title')}
          badge={unread.data ?? 0}
          onPress={() => router.push('/notifications')}
        />
      </View>

      {pending > 0 ? (
        <Notice tone="info" icon="cloud-upload-outline" text={t('home.pendingUploads', { count: pending })} action={{ label: t('common.retry'), onPress: () => void processQueue(true) }} />
      ) : null}

      {/* Safety overview */}
      <Animated.View entering={FadeInDown.duration(500)}>
        <Card variant="hero">
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="heading" style={{ color: '#fff' }}>
                {t('home.overviewTitle')}
              </Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <Text variant="label" style={{ color: '#fff' }}>
                  {t('home.overviewRadius', { km: RADIUS / 1000 })}
                </Text>
              </View>
            </View>
            {loc.permission !== 'granted' ? (
              <View style={{ gap: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{t('home.locationWhy')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    if (await requestLocationPermission()) await loc.refresh();
                  }}
                  style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}
                >
                  <Text weight="semibold" style={{ color: '#1650C4' }}>
                    {t('home.enableLocation')}
                  </Text>
                </Pressable>
              </View>
            ) : nearby.isLoading ? (
              <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{t('common.loading')}</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 18 }}>
                  <View>
                    <Text variant="display" style={{ color: '#fff' }}>
                      {hazards.length}
                    </Text>
                    <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {t('home.activeNearby')}
                    </Text>
                  </View>
                  <View>
                    <Text variant="display" style={{ color: '#FFB46B' }}>
                      {high}
                    </Text>
                    <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {t('home.highPriority')}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {hazards.length === 0
                    ? t('home.noneNearby', { km: RADIUS / 1000 })
                    : t('home.nearest', { distance: formatDistance(nearest) })}
                </Text>
              </>
            )}
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {nearby.data?.fromCache
                ? t('map.offlineCached', { time: timeAgo(nearby.data.cachedAt ? new Date(nearby.data.cachedAt).toISOString() : null) })
                : t('home.overviewNote')}
            </Text>
          </View>
        </Card>
      </Animated.View>

      {/* Quick actions */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <QuickAction icon="camera" label={t('home.quickReport')} color={p.warning} onPress={() => router.push('/report/new')} />
        <QuickAction icon="map" label={t('home.openMap')} color={p.cyan} onPress={() => router.push('/(tabs)/map')} />
        <QuickAction icon="git-compare" label={t('home.planRoute')} color={p.primary} onPress={() => router.push('/route')} />
      </View>

      {/* Nearby */}
      {loc.permission === 'granted' ? (
        <Section
          title={t('home.nearbyTitle')}
          action={
            hazards.length > 3 ? (
              <Pressable onPress={() => router.push('/(tabs)/map')} hitSlop={8}>
                <Text variant="caption" tone="primary" weight="semibold">
                  {t('common.seeAll')}
                </Text>
              </Pressable>
            ) : undefined
          }
        >
          {nearby.isLoading ? (
            <SkeletonCard lines={2} />
          ) : hazards.length === 0 ? (
            <Text tone="muted">{t('home.noneNearby', { km: RADIUS / 1000 })}</Text>
          ) : (
            hazards.slice(0, 3).map((h) => <HazardRow key={h.id} hazard={h} />)
          )}
        </Section>
      ) : null}

      {/* My stats */}
      <Section title={t('home.myStats')}>
        <Card onPress={() => router.push('/(tabs)/reports')}>
          {stats.isLoading || !stats.data ? (
            <SkeletonCard lines={1} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AnimatedStat value={stats.data.total} label={t('home.statTotal')} color={p.primary} />
              <AnimatedStat value={stats.data.pending} label={t('home.statPending')} color={p.warning} />
              <AnimatedStat value={stats.data.active} label={t('home.statActive')} color={p.cyan} />
              <AnimatedStat value={stats.data.resolved} label={t('home.statResolved')} color={p.success} />
            </View>
          )}
        </Card>
      </Section>

      {/* Maintenance updates */}
      <Section title={t('home.updatesTitle')}>
        {activity.isLoading ? (
          <SkeletonCard lines={2} />
        ) : (activity.data ?? []).length === 0 ? (
          <Text tone="muted">{t('home.noUpdates')}</Text>
        ) : (
          <Card padded={false}>
            {(activity.data ?? []).map((a, i) => (
              <Pressable
                key={`${a.hazard_id}-${a.created_at}`}
                onPress={() => router.push(`/hazard/${a.hazard_id}`)}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  padding: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: p.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text weight="medium" numberOfLines={1}>
                    {a.public_code} · {t(`categories.${a.category}`)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {timeAgo(a.created_at)}
                  </Text>
                </View>
                <StatusBadge status={a.to_status} />
              </Pressable>
            ))}
          </Card>
        )}
      </Section>

      {/* Safety tips carousel */}
      <Section title={t('home.tipsTitle')}>
        <FlatList
          horizontal
          data={TIPS}
          keyExtractor={(i) => i.key}
          showsHorizontalScrollIndicator={false}
          snapToInterval={width * 0.72 + 12}
          decelerationRate="fast"
          contentContainerStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <Card style={{ width: width * 0.72 }}>
              <View style={{ gap: 8 }}>
                <Ionicons name={item.icon} size={26} color={p.cyan} />
                <Text weight="semibold">{t(`home.${item.key}Title`)}</Text>
                <Text variant="caption" tone="muted">
                  {t(`home.${item.key}`)}
                </Text>
              </View>
            </Card>
          )}
        />
      </Section>
    </Screen>
  );
}
