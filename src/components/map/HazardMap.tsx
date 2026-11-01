import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Supercluster from 'supercluster';
import { categoryIcon, SeverityBadge } from '@/components/ui/Badges';
import { Text } from '@/components/ui/Text';
import { formatDistance, formatNumber } from '@/lib/format';
import { haversine } from '@/lib/geo';
import { nativeMapsAvailable } from '@/lib/maps';
import { openInMaps } from '@/lib/routing';
import type { HazardSummary } from '@/lib/types';
import { darkMapStyle, severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export const zoomFromRegion = (r: Region) => Math.max(0, Math.min(20, Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-6)))));

type Props = {
  hazards: HazardSummary[];
  initialRegion: Region;
  mapType?: 'standard' | 'satellite';
  onRegionChangeComplete?: (r: Region) => void;
  onSelect?: (h: HazardSummary) => void;
  selectedId?: string | null;
  showsUserLocation?: boolean;
  cluster?: boolean;
  children?: ReactNode;
  scrollEnabled?: boolean;
  /** Space taken by overlays drawn on top of the map (used by the list fallback). */
  overlayInsets?: { top: number; bottom: number };
};

type PointProps = { hazard: HazardSummary };

export function HazardPin({ hazard, selected }: { hazard: HazardSummary; selected?: boolean }) {
  const { p } = useTheme();
  const c = severityColor(p, hazard.severity);
  const size = selected ? 40 : 32;
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c,
          borderWidth: 3,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: c,
          shadowOpacity: 0.6,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 5,
        }}
      >
        <Ionicons name={categoryIcon[hazard.category]} size={size * 0.45} color="#FFFFFF" />
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF', marginTop: -2 }} />
    </View>
  );
}

function ClusterPin({ count, worst }: { count: number; worst: HazardSummary['severity'] }) {
  const { p } = useTheme();
  const c = severityColor(p, worst);
  const size = count >= 100 ? 58 : count >= 20 ? 50 : 42;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c + '44',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size - 12,
          height: size - 12,
          borderRadius: (size - 12) / 2,
          backgroundColor: c,
          borderWidth: 2,
          borderColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="label" style={{ color: '#fff' }}>
          {formatNumber(count)}
        </Text>
      </View>
    </View>
  );
}

const SEV_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
const RANK_SEV = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Themed native map (Apple Maps on iOS, Google Maps on Android) with severity-coloured hazard
 * markers and client-side clustering (supercluster). Only verified hazards are ever passed in.
 */
/**
 * Shown instead of the map on Android builds made without a Google Maps key (the Google Maps
 * SDK would crash). Same data and callbacks: verified hazards nearest first, tap to select,
 * and `animateToRegion` (used by place search) reloads the list for the new area.
 */
const MapListFallback = forwardRef<MapView, Props>(function MapListFallback(
  { hazards, initialRegion, onRegionChangeComplete, onSelect, selectedId, overlayInsets },
  ref,
) {
  const { p } = useTheme();
  const { t } = useTranslation();
  const [center, setCenter] = useState<Region>(initialRegion);
  useImperativeHandle(
    ref,
    () =>
      ({
        animateToRegion: (r: Region) => {
          setCenter(r);
          onRegionChangeComplete?.(r);
        },
        animateCamera: () => undefined,
        fitToCoordinates: () => undefined,
      }) as unknown as MapView,
    [onRegionChangeComplete],
  );
  const rows = useMemo(
    () =>
      hazards
        .map((h) => ({ h, d: haversine(center, h) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 100),
    [hazards, center],
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ paddingTop: (overlayInsets?.top ?? 0) + 12, paddingBottom: (overlayInsets?.bottom ?? 0) + 16, paddingHorizontal: 14, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border }}>
        <Ionicons name="list" size={20} color={p.cyan} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="semibold">{t('map.listModeTitle')}</Text>
          <Text variant="caption" tone="muted">
            {t('map.listModeBody')}
          </Text>
        </View>
      </View>
      {rows.map(({ h, d }) => (
        <Pressable
          key={h.id}
          accessibilityRole="button"
          accessibilityLabel={`${t(`categories.${h.category}`)} · ${t(`severity.${h.severity}`)} · ${formatDistance(d)}`}
          onPress={() => onSelect?.(h)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 18,
            backgroundColor: p.surface,
            borderWidth: selectedId === h.id ? 2 : 1,
            borderColor: selectedId === h.id ? p.primary : p.border,
          }}
        >
          <HazardPin hazard={h} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text weight="semibold" numberOfLines={1}>
              {t(`categories.${h.category}`)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <SeverityBadge severity={h.severity} />
              <Text variant="caption" tone="muted">
                {formatDistance(d)}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.directions')}
            hitSlop={8}
            onPress={() => void openInMaps(h)}
            style={{ padding: 8 }}
          >
            <Ionicons name="navigate-outline" size={20} color={p.primary} />
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
});

export const HazardMap = forwardRef<MapView, Props>(function HazardMap(props, ref) {
  return nativeMapsAvailable ? <NativeHazardMap {...props} ref={ref} /> : <MapListFallback {...props} ref={ref} />;
});

const NativeHazardMap = forwardRef<MapView, Props>(function NativeHazardMap(
  {
    hazards,
    initialRegion,
    mapType = 'standard',
    onRegionChangeComplete,
    onSelect,
    selectedId,
    showsUserLocation = true,
    cluster = true,
    children,
    scrollEnabled = true,
  },
  ref,
) {
  const { isDark } = useTheme();
  const [region, setRegion] = useState<Region>(initialRegion);

  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, { worst: number }>({
      radius: 56,
      maxZoom: 16,
      map: (props) => ({ worst: SEV_RANK[props.hazard.severity] }),
      reduce: (acc, props) => {
        acc.worst = Math.max(acc.worst, props.worst);
      },
    });
    sc.load(
      hazards.map((h) => ({
        type: 'Feature' as const,
        properties: { hazard: h },
        geometry: { type: 'Point' as const, coordinates: [h.longitude, h.latitude] },
      })),
    );
    return sc;
  }, [hazards]);

  const features = useMemo(() => {
    if (!cluster) return null;
    const west = region.longitude - region.longitudeDelta / 2;
    const east = region.longitude + region.longitudeDelta / 2;
    const south = region.latitude - region.latitudeDelta / 2;
    const north = region.latitude + region.latitudeDelta / 2;
    return index.getClusters([west, south, east, north], zoomFromRegion(region));
  }, [index, region, cluster]);

  return (
    <MapView
      ref={ref}
      style={{ flex: 1 }}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      mapType={mapType}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      scrollEnabled={scrollEnabled}
      userInterfaceStyle={isDark ? 'dark' : 'light'}
      customMapStyle={Platform.OS === 'android' && isDark && mapType === 'standard' ? darkMapStyle : undefined}
      onRegionChangeComplete={(r) => {
        setRegion(r);
        onRegionChangeComplete?.(r);
      }}
    >
      {features
        ? features.map((f) => {
            const [lng, lat] = f.geometry.coordinates as [number, number];
            const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; worst?: number } & Partial<PointProps>;
            if (props.cluster) {
              return (
                <Marker
                  key={`c-${props.cluster_id}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  tracksViewChanges={false}
                  accessibilityLabel={`${props.point_count} hazards`}
                  onPress={() => {
                    const zoom = Math.min(index.getClusterExpansionZoom(props.cluster_id!), 18);
                    const delta = 360 / 2 ** zoom;
                    (ref as React.RefObject<MapView | null>)?.current?.animateToRegion(
                      { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta },
                      350,
                    );
                  }}
                >
                  <ClusterPin count={props.point_count ?? 0} worst={RANK_SEV[props.worst ?? 0] ?? 'low'} />
                </Marker>
              );
            }
            const h = props.hazard!;
            return (
              <Marker
                key={h.id}
                coordinate={{ latitude: h.latitude, longitude: h.longitude }}
                tracksViewChanges={selectedId === h.id}
                anchor={{ x: 0.5, y: 1 }}
                accessibilityLabel={`${h.category} ${h.severity}`}
                onPress={() => onSelect?.(h)}
              >
                <HazardPin hazard={h} selected={selectedId === h.id} />
              </Marker>
            );
          })
        : hazards.map((h) => (
            <Marker
              key={h.id}
              coordinate={{ latitude: h.latitude, longitude: h.longitude }}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => onSelect?.(h)}
            >
              <HazardPin hazard={h} selected={selectedId === h.id} />
            </Marker>
          ))}
      {children}
    </MapView>
  );
});
