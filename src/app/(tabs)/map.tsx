import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HazardMap } from '@/components/map/HazardMap';
import { HazardRow } from '@/components/report/HazardBits';
import { CategoryIcon, Chip, PriorityBadge, SeverityBadge, StatusBadge, categoryIcon } from '@/components/ui/Badges';
import { Button, IconButton } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/Controls';
import { Notice } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { hazardsInBBox } from '@/lib/api/hazards';
import { DEMO_REGION } from '@/lib/env';
import { formatDistance, timeAgo } from '@/lib/format';
import { haversine, regionToBBox } from '@/lib/geo';
import { getCurrentPosition, requestLocationPermission, searchPlaces, useLocationStore, type PlaceResult } from '@/lib/location';
import { cacheTimestamp, cachedHazardsInBBox, reconcileArea } from '@/lib/offline/cache';
import { openExternalNavigation } from '@/lib/routing';
import { HAZARD_CATEGORIES, type HazardCategory, type HazardSummary } from '@/lib/types';
import { useNetwork } from '@/stores/network';
import { useSettings } from '@/stores/settings';
import { severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function MapScreen() {
  const { t } = useTranslation();
  const { p, isDark, font, lang } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const online = useNetwork((s) => s.online);
  const mapType = useSettings((s) => s.mapType);
  const setMapType = useSettings((s) => s.setMapType);
  const position = useLocationStore((s) => s.position);

  const initial = useMemo<Region>(
    () =>
      position
        ? { latitude: position.latitude, longitude: position.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
        : { ...DEMO_REGION },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [region, setRegion] = useState<Region>(initial);
  const [debounced, setDebounced] = useState<Region>(initial);
  const [categories, setCategories] = useState<HazardCategory[]>([]);
  const [selected, setSelected] = useState<HazardSummary | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(region), 450);
    return () => clearTimeout(timer);
  }, [region]);

  const box = useMemo(() => regionToBBox(debounced), [debounced]);
  const tooWide = debounced.longitudeDelta > 3;

  const hazards = useQuery({
    queryKey: ['map-hazards', box.minLat.toFixed(3), box.minLng.toFixed(3), box.maxLat.toFixed(3), box.maxLng.toFixed(3), categories.join(','), online],
    enabled: !tooWide,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (online) {
        try {
          const list = await hazardsInBBox(box, categories, 1500);
          if (categories.length === 0) void reconcileArea(box, list);
          return { list, fromCache: false, cachedAt: null as number | null };
        } catch {
          // fall back to cache
        }
      }
      const cached = (await cachedHazardsInBBox(box)).filter((h) => categories.length === 0 || categories.includes(h.category));
      return { list: cached, fromCache: true, cachedAt: await cacheTimestamp() };
    },
  });

  const list = hazards.data?.list ?? [];
  const center = { latitude: debounced.latitude, longitude: debounced.longitude };
  const sorted = useMemo(
    () => list.map((h) => ({ ...h, distance_m: haversine(position ?? center, h) })).sort((a, b) => a.distance_m - b.distance_m),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, position?.latitude, position?.longitude],
  );

  const recenter = async () => {
    const ok = useLocationStore.getState().permission === 'granted' || (await requestLocationPermission());
    if (!ok) return;
    const pos = await getCurrentPosition({ precise: true }).catch(() => null);
    if (pos) mapRef.current?.animateToRegion({ ...pos, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
  };

  const runSearch = async () => {
    Keyboard.dismiss();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(query));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const toggleCategory = (c: HazardCategory) =>
    setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={isDark || mapType === 'satellite' ? 'light' : 'dark'} />
      <HazardMap
        ref={mapRef}
        hazards={list}
        initialRegion={initial}
        mapType={mapType}
        selectedId={selected?.id}
        onSelect={setSelected}
        onRegionChangeComplete={setRegion}
        overlayInsets={{ top: insets.top + 112, bottom: 250 }}
      />

      {/* Top overlay: search, filters */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 14, right: 14, gap: 10 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 48,
              paddingHorizontal: 14,
              borderRadius: 24,
              backgroundColor: p.glass,
              borderWidth: 1,
              borderColor: p.border,
            }}
          >
            <Ionicons name="search" size={18} color={p.textMuted} />
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                if (!v) setResults(null);
              }}
              onSubmitEditing={runSearch}
              returnKeyType="search"
              placeholder={t('map.searchPlaceholder')}
              placeholderTextColor={p.textFaint}
              accessibilityLabel={t('map.searchPlaceholder')}
              style={{ flex: 1, color: p.text, fontFamily: font.regular, fontSize: 15, textAlign: lang === 'ar' ? 'right' : 'left' }}
            />
            {searching ? <ActivityIndicator color={p.primary} /> : null}
          </View>
          <IconButton
            tone="glass"
            icon={mapType === 'standard' ? 'earth' : 'map'}
            label={t('map.layers')}
            onPress={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
          />
        </View>

        {results ? (
          <Animated.View entering={FadeIn} style={{ borderRadius: 20, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, overflow: 'hidden' }}>
            {results.length === 0 ? (
              <Text tone="muted" style={{ padding: 14 }}>
                {t('map.noResults')}
              </Text>
            ) : (
              results.map((r, i) => (
                <Pressable
                  key={`${r.latitude}-${r.longitude}-${i}`}
                  onPress={() => {
                    setResults(null);
                    mapRef.current?.animateToRegion({ latitude: r.latitude, longitude: r.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600);
                  }}
                  style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: p.border, flexDirection: 'row', gap: 10, alignItems: 'center' }}
                >
                  <Ionicons name="location-outline" size={18} color={p.primary} />
                  <Text style={{ flex: 1 }} numberOfLines={2}>
                    {r.label}
                  </Text>
                </Pressable>
              ))
            )}
          </Animated.View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={t('map.allCategories')} selected={categories.length === 0} onPress={() => setCategories([])} />
            {HAZARD_CATEGORIES.map((c) => (
              <Chip key={c} label={t(`categories.${c}`)} icon={categoryIcon[c]} selected={categories.includes(c)} onPress={() => toggleCategory(c)} />
            ))}
          </ScrollView>
        )}

        {hazards.data?.fromCache ? (
          <Notice
            tone="warning"
            icon="cloud-offline-outline"
            text={t('map.offlineCached', { time: timeAgo(hazards.data.cachedAt ? new Date(hazards.data.cachedAt).toISOString() : null) })}
          />
        ) : null}
        {tooWide ? <Notice tone="info" text={t('map.tooManyToShow')} /> : null}
      </View>

      <View style={{ position: 'absolute', right: 14, bottom: 260, gap: 10 }}>
        <IconButton tone="glass" icon="locate" label={t('map.recenter')} onPress={recenter} size={48} />
      </View>

      <BottomSheet peek={selected ? 250 : 150}>
        {selected ? (
          <Animated.View key={selected.id} entering={FadeInDown} style={{ paddingHorizontal: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <CategoryIcon category={selected.category} color={severityColor(p, selected.severity)} size={50} />
              <View style={{ flex: 1 }}>
                <Text variant="heading">{t(`categories.${selected.category}`)}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {[selected.address, selected.city].filter(Boolean).join(' · ') || t('common.unknownPlace')}
                </Text>
              </View>
              <IconButton icon="close" label={t('common.close')} onPress={() => setSelected(null)} size={36} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <SeverityBadge severity={selected.severity} />
              <StatusBadge status={selected.status} />
              {selected.priority?.active ? <PriorityBadge level={selected.priority.level} score={selected.priority.score} /> : null}
            </View>
            <Text variant="caption" tone="muted">
              {t('map.confirmations', { count: selected.confirmations_count })} · {t('map.reported', { time: timeAgo(selected.created_at) })}
              {position ? ` · ${formatDistance(haversine(position, selected))}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} label={t('map.viewDetails')} icon="information-circle" onPress={() => router.push(`/hazard/${selected.id}`)} />
              <Button style={{ flex: 1 }} variant="secondary" label={t('map.directions')} icon="navigate" onPress={() => void openExternalNavigation(selected)} />
            </View>
          </Animated.View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="heading">{t('map.nearbyList')}</Text>
              {hazards.isFetching ? <ActivityIndicator color={p.primary} /> : null}
            </View>
            <Text variant="caption" tone="muted">
              {t('map.hazardsInView', { count: list.length })} · {t('map.verifiedOnly')}
            </Text>
            <FlatList
              data={sorted.slice(0, 60)}
              keyExtractor={(h) => h.id}
              contentContainerStyle={{ gap: 10, paddingBottom: 120 }}
              renderItem={({ item }) => (
                <HazardRow
                  hazard={item}
                  onPress={() => {
                    setSelected(item);
                    mapRef.current?.animateToRegion({ latitude: item.latitude, longitude: item.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 450);
                  }}
                />
              )}
            />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}
