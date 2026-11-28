import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { myReportCovers } from '@/lib/api/hazards';
import { timeAgo } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { ReportStatus } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';

type Item = { id: string; public_code: string; category: string; status: ReportStatus; created_at: string };
const STEPS: ReportStatus[] = ['submitted', 'verified', 'assigned', 'in_progress', 'resolved'];
export const stepOf = (s: ReportStatus) => (s === 'under_review' ? 0 : s === 'reopened' ? 1 : Math.max(0, STEPS.indexOf(s)));

/** Swipeable previews of the user's own reports: their real photo + a 5-step progress track. */
export function ReportCarousel({ reports }: { reports: Item[] }) {
  const { t } = useTranslation();
  const { p, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const cardW = Math.min(300, width * 0.74);
  const items = reports.slice(0, 8);
  const covers = useQuery({ queryKey: ['report-covers', items.map((r) => r.id).join(',')], queryFn: () => myReportCovers(items.map((r) => r.id)), staleTime: 30 * 60_000 });

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(r) => r.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardW + 12}
      decelerationRate="fast"
      contentContainerStyle={{ gap: 12, paddingEnd: 20 }}
      renderItem={({ item, index }) => {
        const closed = item.status === 'rejected' || item.status === 'duplicate';
        const step = stepOf(item.status);
        const uri = covers.data?.[item.id];
        return (
          <Animated.View entering={reduceMotion ? undefined : FadeInRight.delay(index * 60).springify().damping(18)}>
            <Pressable onPress={() => { haptic.light(); router.push(`/hazard/${item.id}`); }} accessibilityRole="button"
              accessibilityLabel={`${item.public_code} ${t(`status.${item.status}`)}`}
              style={({ pressed }) => ({ width: cardW, borderRadius: 24, overflow: 'hidden', backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <View style={{ height: 150, backgroundColor: p.surface2 }}>
                {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={reduceMotion ? 0 : 250} cachePolicy="memory-disk" />
                  : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="image-outline" size={28} color={p.textFaint} /></View>}
                <View style={{ position: 'absolute', top: 10, start: 10, backgroundColor: 'rgba(7,22,41,0.72)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text variant="label" style={{ color: '#fff' }}>{item.public_code}</Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text weight="semibold">{t(`categories.${item.category}`)}</Text>
                  <Text variant="caption" tone="faint">{timeAgo(item.created_at)}</Text>
                </View>
                {closed ? (
                  <Text variant="caption" tone="danger">{t(`status.${item.status}`)}</Text>
                ) : (
                  <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 4, now: step, text: t(`status.${item.status}`) }}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? (step === 4 ? p.success : p.primary) : p.surface2 }} />)}
                    </View>
                    <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>{t(`status.${item.status}`)}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </Animated.View>
        );
      }}
    />
  );
}
