import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { HazardMap } from '@/components/map/HazardMap';
import { GlassButton, GlassSurface } from '@/components/ui/Glass';
import { Text } from '@/components/ui/Text';
import type { HazardSummary } from '@/lib/types';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  position: { latitude: number; longitude: number } | null;
  hazards: HazardSummary[];
  placeLabel: string;
  counts: { total: number; high: number } | null;
  locationGranted: boolean;
  onEnableLocation: () => void;
};

/**
 * Home centerpiece: the user's real surroundings with verified hazards (Apple Maps on iOS,
 * Google Maps on Android, list fallback when no Android key), floating glass controls and the
 * primary Scan Road action. Tapping the map opens the full map tab.
 */
export function MapHero({ position, hazards, placeLabel, counts, locationGranted, onEnableLocation }: Props) {
  const { t } = useTranslation();
  const { p, reduceMotion } = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), -1);
  }, [pulse, reduceMotion]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.35 }] }));

  return (
    <View style={{ height: 380, borderRadius: 30, overflow: 'hidden', backgroundColor: p.surface2 }}>
      {position ? (
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/(tabs)/map')} accessibilityRole="button" accessibilityLabel={t('home.openMap')}>
          <View pointerEvents="none" style={{ flex: 1 }}>
            <HazardMap
              hazards={hazards}
              initialRegion={{ latitude: position.latitude, longitude: position.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
              showsUserLocation
              scrollEnabled={false}
              onSelect={() => undefined}
            />
          </View>
        </Pressable>
      ) : (
        <LinearGradient colors={['#10233E', '#071629']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
          <Ionicons name="navigate-circle-outline" size={44} color={p.cyan} />
          <Text center style={{ color: 'rgba(255,255,255,0.85)' }}>{t('home.locationWhy')}</Text>
          {!locationGranted ? (
            <Pressable accessibilityRole="button" onPress={() => { haptic.light(); onEnableLocation(); }}
              style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text weight="semibold" style={{ color: '#1650C4' }}>{t('home.enableLocation')}</Text>
            </Pressable>
          ) : null}
        </LinearGradient>
      )}

      {/* top: location + verified counts */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 8 }}>
        <GlassSurface radius={18} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 }}>
          <Ionicons name="navigate" size={13} color={p.cyan} />
          <Text variant="caption" weight="semibold" numberOfLines={1}>{placeLabel}</Text>
        </GlassSurface>
        {counts ? (
          <GlassSurface radius={18} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text variant="caption" weight="semibold">{t('home.verifiedCount', { count: counts.total })}</Text>
            {counts.high ? <Text variant="caption" weight="semibold" style={{ color: p.danger }}>{t('home.highCount', { count: counts.high })}</Text> : null}
          </GlassSurface>
        ) : null}
      </View>

      {/* bottom fade + Scan Road */}
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(7,22,41,0.55)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }} />
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' }}>
        <View pointerEvents="box-none" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 210, height: 64, borderRadius: 32, borderWidth: 2, borderColor: p.primary }, ring]} />
          <GlassButton label={t('home.scanRoad')} onPress={() => { haptic.medium(); router.push('/report/new'); }} size={64} tint={p.primary} testID="home-scan">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}>
              <Ionicons name="scan" size={24} color="#fff" />
              <Text weight="bold" style={{ color: '#fff', fontSize: 17 }}>{t('home.scanRoad')}</Text>
            </View>
          </GlassButton>
        </View>
      </View>
    </View>
  );
}
