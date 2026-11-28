import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Floating control surface for navigation, map and camera controls (never for content cards).
 *
 *  - iOS 26+ with Liquid Glass available → Apple's native glass (`expo-glass-effect` GlassView,
 *    i.e. UIGlassEffect), interactive when pressable.
 *  - iOS with "Reduce Transparency" on, or iOS < 26 → system blur material (UIVisualEffectView),
 *    or a solid surface when transparency is reduced.
 *  - Android → an opaque Material 3 tonal surface with elevation. We deliberately do not imitate
 *    iOS glass on Android.
 */
export function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

let liquid: boolean | null = null;
export function liquidGlassAvailable() {
  if (liquid === null) {
    try {
      liquid = Platform.OS === 'ios' && isLiquidGlassAvailable();
    } catch {
      liquid = false;
    }
  }
  return liquid;
}

type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; tint?: string; interactive?: boolean };

export function GlassSurface({ children, style, radius = 22, tint, interactive = false }: Props) {
  const { p, isDark } = useTheme();
  const reduce = useReduceTransparency();
  const base: ViewStyle = { borderRadius: radius, overflow: 'hidden' };

  if (Platform.OS === 'ios' && liquidGlassAvailable() && !reduce) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} tintColor={tint} colorScheme={isDark ? 'dark' : 'light'} style={[base, style]}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'ios' && !reduce) {
    return (
      <BlurView tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={90} style={[base, style]}>
        {tint ? <View style={{ ...absoluteFill, backgroundColor: tint, opacity: 0.85 }} /> : null}
        {children}
      </BlurView>
    );
  }
  // Android (Material tonal surface) and iOS with Reduce Transparency: solid, elevated, readable.
  return (
    <View
      style={[
        base,
        {
          backgroundColor: tint ?? (isDark ? '#1A2A44' : '#FFFFFF'),
          borderWidth: Platform.OS === 'ios' ? 1 : 0,
          borderColor: p.border,
          elevation: 6,
          overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const absoluteFill: ViewStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 };

/** Round floating button on a GlassSurface with haptic feedback. */
export function GlassButton({ children, onPress, label, size = 48, tint, style, testID }: {
  children: ReactNode; onPress: () => void; label: string; size?: number; tint?: string; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: false }}
      style={({ pressed }) => [{ transform: [{ scale: pressed && Platform.OS === 'ios' && !liquidGlassAvailable() ? 0.96 : 1 }] }, style]}
    >
      <GlassSurface radius={size / 2} tint={tint} interactive style={{ minWidth: size, height: size, alignItems: 'center', justifyContent: 'center', paddingHorizontal: size > 52 ? 18 : 0 }}>
        {children}
      </GlassSurface>
    </Pressable>
  );
}
