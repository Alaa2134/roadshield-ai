import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics';

/**
 * Before/after comparison of two REAL evidence photos (maintenance task images of kind
 * 'before' and 'after'). Drag the handle; layout is forced LTR so "before" stays on the left
 * physically, while labels are translated.
 */
export function BeforeAfter({ before, after, height = 240, beforeLabel, afterLabel }: { before: string; after: string; height?: number; beforeLabel: string; afterLabel: string }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0.5);
  const start = useSharedValue(0.5);
  const tick = () => haptic.tap();
  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      start.value = x.value;
    },
    onUpdate: (e) => {
      'worklet';
      if (!w) return;
      const next = Math.max(0, Math.min(1, start.value + e.translationX / w));
      if ((x.value - 0.5) * (next - 0.5) < 0) runOnJS(tick)();
      x.value = next;
    },
  });
  const clip = useAnimatedStyle(() => ({ width: x.value * w }));
  const handle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w - 20 }] }));
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height, borderRadius: 20, overflow: 'hidden', direction: 'ltr' }}
        accessible accessibilityRole="adjustable" accessibilityLabel={`${beforeLabel} / ${afterLabel}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => { x.value = Math.max(0, Math.min(1, x.value + (e.nativeEvent.actionName === 'increment' ? 0.25 : -0.25))); }}>
        <Image source={{ uri: after }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' }, clip]}>
          <Image source={{ uri: before }} style={{ width: w, height }} contentFit="cover" cachePolicy="memory-disk" />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 40, alignItems: 'center' }, handle]}>
          <View style={{ flex: 1, width: 2, backgroundColor: '#fff' }} />
          <View style={{ position: 'absolute', top: height / 2 - 18, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
            <Ionicons name="chevron-back" size={14} color="#071629" /><Ionicons name="chevron-forward" size={14} color="#071629" />
          </View>
        </Animated.View>
        <Text variant="label" style={{ position: 'absolute', top: 10, left: 12, color: '#fff', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' }}>{beforeLabel}</Text>
        <Text variant="label" style={{ position: 'absolute', top: 10, right: 12, color: '#fff', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' }}>{afterLabel}</Text>
      </View>
    </GestureDetector>
  );
}
