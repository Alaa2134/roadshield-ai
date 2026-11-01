import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { LOW_CONFIDENCE } from '@/lib/ai';
import type { Detection } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';

const BOX_COLORS: Record<Detection['category'], string> = {
  pothole: '#F04452',
  crack: '#FF9B35',
  surface_damage: '#00D6FF',
};

/**
 * Photo with the model's bounding boxes drawn on top (the annotated image). Boxes use the
 * model's normalised coordinates, so they line up at any display size. The overlay is forced
 * to LTR so boxes stay at their physical positions in Arabic/RTL layouts.
 */
export function AnnotatedImage({ uri, aspect, detections }: { uri: string; aspect: number; detections: Detection[] }) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{ width: '100%', aspectRatio: aspect || 4 / 3, borderRadius: 20, overflow: 'hidden', direction: 'ltr' }}
      accessible
      accessibilityLabel={detections.map((d) => `${t(`categories.${d.category}`)} ${Math.round(d.confidence * 100)}%`).join(', ')}
    >
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
      {size.w > 0
        ? detections.map((d, i) => {
            const [x1, y1, x2, y2] = d.box;
            const color = BOX_COLORS[d.category];
            return (
              <Animated.View
                key={i}
                entering={ZoomIn.delay(150 + i * 80)}
                style={{
                  position: 'absolute',
                  left: x1 * size.w,
                  top: y1 * size.h,
                  width: Math.max(8, (x2 - x1) * size.w),
                  height: Math.max(8, (y2 - y1) * size.h),
                  borderWidth: 2.5,
                  borderColor: color,
                  borderRadius: 6,
                }}
              >
                <View style={{ position: 'absolute', top: -22, left: -2, backgroundColor: color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text variant="label" style={{ color: '#fff', fontSize: 10, lineHeight: 14 }}>
                    {t(`categories.${d.category}`)} {Math.round(d.confidence * 100)}%
                  </Text>
                </View>
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  const color = value >= 0.75 ? p.success : value >= LOW_CONFIDENCE ? p.warning : p.danger;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="muted">
          {t('report.aiConfidence', { value: Math.round(value * 100) })}
        </Text>
        {value < LOW_CONFIDENCE ? <Ionicons name="alert-circle" size={16} color={p.danger} /> : null}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: p.surface2, overflow: 'hidden' }}>
        <Animated.View entering={FadeIn.duration(600)} style={{ width: `${Math.round(value * 100)}%`, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
}
