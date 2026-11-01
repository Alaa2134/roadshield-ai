import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, Platform, Pressable, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Animated, { FadeInDown, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { HazardMap, HazardPin } from '@/components/map/HazardMap';
import { Pill } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleRow } from '@/components/ui/Controls';
import { Notice } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useHazardWarnings } from '@/hooks/useHazardWarnings';
import { hazardsInBBox } from '@/lib/api/hazards';
import { DEMO_REGION } from '@/lib/env';
import { formatDistance, formatNumber } from '@/lib/format';
import { bboxOf } from '@/lib/geo';
import { getCurrentPosition, requestLocationPermission, searchPlaces, useLocationStore, type PlaceResult } from '@/lib/location';
import { cachedHazardsInBBox } from '@/lib/offline/cache';
import { assessRoute, fetchRoutes, openExternalNavigation, type RouteAssessment } from '@/lib/routing';
import { nativeMapsAvailable } from '@/lib/maps';
import { env } from '@/lib/env';
import type { LatLng } from '@/lib/types';
import { useNetwork } from '@/stores/network';
import { useSettings } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function RouteSafety() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const online = useNetwork((s) => s.online);
  const position = useLocationStore((s) => s.position);
  const voice = useSettings((s) => s.voiceWarnings);
  const setVoice = useSettings((s) => s.setVoiceWarnings);
  const map = useRef<MapView>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [routes, setRoutes] = useState<RouteAssessment[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [routingFailed, setRoutingFailed] = useState(false);
  const [driveMode, setDriveMode] = useState(false);

  const active = routes?.[selected] ?? null;
  const warning = useHazardWarnings(active, driveMode);

  const search = useMutation({
    mutationFn: (q: string) => searchPlaces(q),
    onSuccess: setResults,
    onError: () => setResults([]),
  });

  const check = useMutation({
    mutationFn: async (to: LatLng) => {
      setRoutingFailed(false);
      const ok = useLocationStore.getState().permission === 'granted' || (await requestLocationPermission());
      if (!ok) throw new Error('location');
      const from = (await getCurrentPosition({ precise: true }))!;
      let options;
      try {
        options = await fetchRoutes(from, to);
      } catch {
        setRoutingFailed(true);
        return [];
      }
      if (options.length === 0) return [];
      const box = bboxOf(options.flatMap((o) => o.coordinates), 60);
      const hazards = online ? await hazardsInBBox(box, null, 2000).catch(() => cachedHazardsInBBox(box)) : await cachedHazardsInBBox(box);
      const assessed = options.map((o) => assessRoute(o, hazards));
      const all = assessed.flatMap((a) => a.coordinates);
      setTimeout(() => map.current?.fitToCoordinates(all, { edgePadding: { top: 60, bottom: 60, left: 40, right: 40 }, animated: true }), 300);
      return assessed;
    },
    onSuccess: (r) => {
      setRoutes(r);
      setSelected(0);
    },
  });

  const fastest = routes?.length ? routes.reduce((a, b) => (b.durationS < a.durationS ? b : a)).index : -1;
  const safest = routes?.length ? routes.reduce((a, b) => (b.exposure < a.exposure ? b : a)).index : -1;
  const exposureColor = (lvl: RouteAssessment['exposureLevel']) => (lvl === 'high' ? p.danger : lvl === 'medium' ? p.warning : p.success);

  return (
    <Screen back title={t('route.title')} keyboard>
      <Card>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.cyan }} />
            <Text variant="caption" tone="muted">
              {t('route.from')}:
            </Text>
            <Text weight="medium">{t('route.myLocation')}</Text>
          </View>
          <Input
            icon="flag-outline"
            placeholder={t('route.searchDestination')}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setResults(null);
            }}
            returnKeyType="search"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              search.mutate(query);
            }}
          />
          {search.isPending ? <ActivityIndicator color={p.primary} /> : null}
          {results ? (
            results.length === 0 ? (
              <Text tone="muted">{t('map.noResults')}</Text>
            ) : (
              results.map((r, i) => (
                <Pressable
                  key={`${r.latitude}-${i}`}
                  onPress={() => {
                    setDestination(r);
                    setQuery(r.label);
                    setResults(null);
                    setRoutes(null);
                    check.mutate(r);
                  }}
                  style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'center' }}
                >
                  <Ionicons name="location-outline" size={18} color={p.primary} />
                  <Text style={{ flex: 1 }} numberOfLines={2}>
                    {r.label}
                  </Text>
                </Pressable>
              ))
            )
          ) : null}
          {destination && !results ? (
            <Button icon="git-compare-outline" label={t('route.findRoutes')} onPress={() => check.mutate(destination)} loading={check.isPending} />
          ) : null}
        </View>
      </Card>

      {warning ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp} accessibilityLiveRegion="assertive">
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: p.warning }}>
            <Ionicons name="warning" size={28} color="#fff" />
            <Text variant="subheading" style={{ color: '#fff', flex: 1 }}>
              {t('warnings.banner', { category: t(`categories.${warning.hazard.category}`), distance: formatDistance(warning.distanceM) })}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      <View style={{ height: 300, borderRadius: 24, overflow: 'hidden' }}>
        <HazardMap
          ref={map}
          hazards={nativeMapsAvailable ? [] : (active?.hazards.map((rh) => rh.hazard) ?? [])}
          cluster={false}
          initialRegion={
            position ? { latitude: position.latitude, longitude: position.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 } : { ...DEMO_REGION }
          }
        >
          {(routes ?? []).map((r) =>
            r.index === selected ? null : (
              <Polyline key={r.index} coordinates={r.coordinates} strokeColor={p.textFaint} strokeWidth={5} tappable onPress={() => setSelected(r.index)} />
            ),
          )}
          {active ? <Polyline coordinates={active.coordinates} strokeColor={p.primary} strokeWidth={7} /> : null}
          {active?.hazards.map((rh) => (
            <Marker key={rh.hazard.id} coordinate={rh.hazard} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <HazardPin hazard={rh.hazard} />
            </Marker>
          ))}
          {destination ? <Marker coordinate={destination} pinColor={p.cyan} /> : null}
        </HazardMap>
      </View>

      {check.isPending ? <ActivityIndicator color={p.primary} /> : null}
      {check.error ? <Notice tone="warning" text={t('errors.locationDenied')} /> : null}

      {routingFailed && destination ? (
        <Card>
          <View style={{ gap: 12 }}>
            <Notice tone="warning" text={t('route.noRouting')} />
            {Platform.OS === 'ios' ? (
              <Button icon="navigate" label={t('route.openAppleMaps')} onPress={() => void openExternalNavigation(destination, 'apple')} />
            ) : null}
            <Button variant="secondary" icon="logo-google" label={t('route.openGoogleMaps')} onPress={() => void openExternalNavigation(destination, 'google')} />
          </View>
        </Card>
      ) : null}

      {routes && routes.length === 0 && !routingFailed ? <Notice tone="info" text={t('route.noRoutes')} /> : null}

      {(routes ?? []).map((r, i) => (
        <Animated.View key={r.index} entering={FadeInDown.delay(i * 80)}>
          <Card onPress={() => setSelected(r.index)} variant={r.index === selected ? 'surface' : 'outline'} style={{ borderColor: r.index === selected ? p.primary : p.border, borderWidth: r.index === selected ? 2 : 1 }}>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text variant="subheading">{t('route.routeN', { n: i + 1 })}</Text>
                {r.index === fastest ? <Pill label={t('route.fastest')} color={p.primary} icon="flash" /> : null}
                {r.index === safest && routes!.length > 1 ? <Pill label={t('route.fewestHazards')} color={p.success} icon="shield-checkmark" /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <Text weight="semibold">{t('route.duration', { min: formatNumber(Math.round(r.durationS / 60)) })}</Text>
                <Text tone="muted">{t('route.distance', { km: formatNumber(r.distanceM / 1000, 1) })}</Text>
              </View>
              <Text variant="caption">{t('route.hazardsOnRoute', { count: r.hazards.length })}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" tone="muted">
                  {t('route.exposure')}:
                </Text>
                <Pill label={`${t(`route.exposure${r.exposureLevel === 'low' ? 'Low' : r.exposureLevel === 'medium' ? 'Medium' : 'High'}`)} · ${formatNumber(r.exposure, 1)}`} color={exposureColor(r.exposureLevel)} />
              </View>
              <Text variant="caption" tone="faint">
                {t('route.exposureHelp')}
              </Text>
            </View>
          </Card>
        </Animated.View>
      ))}

      {active && destination ? (
        <View style={{ gap: 10 }}>
          <Card>
            <ToggleRow icon="warning-outline" title={t('route.driveMode')} subtitle={t('warnings.activeHint')} value={driveMode} onChange={setDriveMode} />
            <ToggleRow icon="volume-high-outline" title={t('warnings.voiceOn')} value={voice} onChange={setVoice} />
          </Card>
          <Button size="lg" icon="navigate" label={t('route.startNav')} onPress={() => void openExternalNavigation(destination)} />
          <Text variant="caption" tone="faint">
            {t('route.providerNote', { provider: env.routingUrl.replace(/^https?:\/\//, '') })}
          </Text>
        </View>
      ) : null}

      <Notice tone="info" icon="information-circle-outline" text={t('route.disclaimer')} />
    </Screen>
  );
}
