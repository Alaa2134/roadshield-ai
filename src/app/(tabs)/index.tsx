import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FIELD_ROLES, myOrganizations } from '@/lib/api/field';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { HazardRow } from '@/components/report/HazardBits';
import { StatusBadge } from '@/components/ui/Badges';
import { IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDrafts, useMyActivity, useMyLocation, useMyReports, useNearbyHazards, useUnread } from '@/hooks/data';
import { MapHero } from '@/components/home/MapHero';
import { ReportCarousel } from '@/components/home/ReportCarousel';
import { timeAgo } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { requestLocationPermission } from '@/lib/location';
import { processQueue } from '@/lib/offline/sync';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

const RADIUS = 2000;
function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? 'home.greetingMorning' : h < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening';
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { p, reduceMotion } = useTheme();
  const client = useQueryClient();
  const profile = useSession((s) => s.profile);
  const loc = useMyLocation();
  const nearby = useNearbyHazards(loc.position?.latitude, loc.position?.longitude, RADIUS);
  const reports = useMyReports();
  const orgs = useQuery({ queryKey: ['field-orgs'], queryFn: myOrganizations, staleTime: 5 * 60_000 });
  const fieldMember = (orgs.data ?? []).some((m) => FIELD_ROLES.includes(m.role));
  const isRTL = i18n.language === 'ar';
  const activity = useMyActivity();
  const unread = useUnread();
  const { pending } = useDrafts();
  const [refreshing, setRefreshing] = useState(false);

  const hazards = nearby.data?.hazards ?? [];
  const high = hazards.filter((h) => h.priority?.level === 'high').length;
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

      {/* Road intelligence hero: real map, verified hazards, Scan Road */}
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(450)}>
        <MapHero
          position={loc.position ? { latitude: loc.position.latitude, longitude: loc.position.longitude } : null}
          hazards={hazards}
          placeLabel={loc.permission !== 'granted' ? t('home.locationOff') : loc.city ?? (loc.loading ? t('home.locating') : t('common.unknownPlace'))}
          counts={loc.permission === 'granted' && !nearby.isLoading ? { total: hazards.length, high } : null}
          locationGranted={loc.permission === 'granted'}
          onEnableLocation={async () => { if (await requestLocationPermission()) await loc.refresh(); }}
        />
      </Animated.View>
      {nearby.data?.fromCache ? (
        <Text variant="caption" tone="faint">{t('map.offlineCached', { time: timeAgo(nearby.data.cachedAt ? new Date(nearby.data.cachedAt).toISOString() : null) })}</Text>
      ) : null}

      {fieldMember ? (
        <Pressable onPress={() => { haptic.light(); router.push('/field'); }} accessibilityRole="button" accessibilityLabel={t('field.title')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: p.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="clipboard" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="semibold">{t('field.title')}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>{t('field.workOrders')} · {t('field.newInspection')}</Text>
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={p.textFaint} />
        </Pressable>
      ) : null}

      {/* My reports: swipeable photo previews with progress */}
      {(reports.data ?? []).length > 0 ? (
        <Section title={t('home.myReportsTitle')} action={<Pressable onPress={() => router.push('/my-reports')} hitSlop={8}><Text variant="caption" tone="primary" weight="semibold">{t('common.seeAll')}</Text></Pressable>}>
          <ReportCarousel reports={reports.data ?? []} />
        </Section>
      ) : null}

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

    </Screen>
  );
}
