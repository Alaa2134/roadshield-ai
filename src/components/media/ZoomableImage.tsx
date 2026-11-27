import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StatusBar, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

const MAX = 5;

/**
 * Pinch to zoom (1×–5×), drag to pan when zoomed, double-tap to toggle 2.5×.
 * `overlay` (e.g. AI bounding boxes) is transformed together with the image so annotations stay
 * locked to the pixels they describe.
 */
export function ZoomableImage({ uri, aspect, overlay, height }: { uri: string; aspect: number; overlay?: ReactNode; height?: number }) {
  const { width: screenW } = useWindowDimensions();
  const { reduceMotion } = useTheme();
  const w = screenW;
  const h = height ?? w / aspect;
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const anim = (v: number) => {
    'worklet';
    return reduceMotion ? withTiming(v, { duration: 0 }) : withSpring(v, { damping: 20, stiffness: 220 });
  };
  const clamp = (s: number) => {
    'worklet';
    const mx = ((s - 1) * w) / 2;
    const my = ((s - 1) * h) / 2;
    tx.value = anim(Math.max(-mx, Math.min(mx, tx.value)));
    ty.value = anim(Math.max(-my, Math.min(my, ty.value)));
  };

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      startScale.value = scale.value;
    },
    onUpdate: (e) => {
      'worklet';
      scale.value = Math.max(0.9, Math.min(MAX, startScale.value * e.scale));
    },
    onDeactivate: () => {
      'worklet';
      const s = Math.max(1, Math.min(MAX, scale.value));
      scale.value = anim(s);
      clamp(s);
    },
  });
  const pan = usePanGesture({
    minPointers: 1,
    onActivate: () => {
      'worklet';
      sx.value = tx.value;
      sy.value = ty.value;
    },
    onUpdate: (e) => {
      'worklet';
      if (scale.value <= 1) return;
      tx.value = sx.value + e.translationX;
      ty.value = sy.value + e.translationY;
    },
    onDeactivate: () => {
      'worklet';
      clamp(scale.value);
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: () => {
      'worklet';
      const next = scale.value > 1.05 ? 1 : 2.5;
      scale.value = anim(next);
      if (next === 1) {
        tx.value = anim(0);
        ty.value = anim(0);
      }
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: w, height: h, overflow: 'hidden' }} accessibilityHint="Pinch to zoom, double-tap to zoom in or out">
        <Animated.View style={[{ width: w, height: h }, style]}>
          <View style={{ width: w, height: w / aspect, marginTop: (h - w / aspect) / 2, direction: 'ltr' }}>
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" transition={reduceMotion ? 0 : 200} />
            {overlay}
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Full-screen image viewer. */
export function Lightbox({ uri, aspect, overlay, visible, onClose, caption }: {
  uri: string; aspect: number; overlay?: ReactNode; visible: boolean; onClose: () => void; caption?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <ZoomableImage uri={uri} aspect={aspect} overlay={overlay} height={height} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => { haptic.tap(); onClose(); }} hitSlop={12}
          style={{ position: 'absolute', top: insets.top + 8, end: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        {caption ? <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16 }}>{caption}</View> : null}
      </View>
    </Modal>
  );
}

/** Thumbnail that opens the lightbox. */
export function ExpandableImage({ uri, aspect, overlay, children, caption, height = 220 }: {
  uri: string; aspect: number; overlay?: ReactNode; children?: ReactNode; caption?: ReactNode; height?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open photo" onPress={() => { haptic.light(); setOpen(true); }} style={{ height, borderRadius: 20, overflow: 'hidden' }}>
        {children ?? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />}
        <View style={{ position: 'absolute', bottom: 10, end: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="expand" size={15} color="#fff" />
        </View>
      </Pressable>
      <Lightbox uri={uri} aspect={aspect} overlay={overlay} visible={open} onClose={() => setOpen(false)} caption={caption} />
    </>
  );
}
