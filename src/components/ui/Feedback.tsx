import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { Pressable, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme/ThemeProvider';
import type { IconName } from './Button';
import { Button } from './Button';
import { Text } from './Text';

/* ----------------------------------------------------------------- skeleton */
export function Skeleton({ height = 16, width = '100%', radius = 10, style }: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}) {
  const { p, reduceMotion } = useTheme();
  const o = useSharedValue(0.45);
  useEffect(() => {
    if (reduceMotion) return;
    o.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o, reduceMotion]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ height, width, borderRadius: radius, backgroundColor: p.surface2 }, a, style]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const { p } = useTheme();
  return (
    <View style={{ backgroundColor: p.surface, borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: p.border }}>
      <Skeleton height={20} width="55%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------- empty state */
export function EmptyState({
  illustration,
  title,
  body,
  action,
}: {
  illustration?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 10 }}>
      {illustration}
      <Text variant="heading" center>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" center>
          {body}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: 8, alignSelf: 'stretch' }}>
          <Button label={action.label} onPress={action.onPress} icon={action.icon} />
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- inline notice */
export function Notice({
  tone = 'info',
  text,
  icon,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  text: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}) {
  const { p } = useTheme();
  const color = { info: p.cyan, warning: p.warning, danger: p.danger, success: p.success }[tone];
  const ic: IconName =
    icon ?? (tone === 'success' ? 'checkmark-circle' : tone === 'info' ? 'information-circle' : 'alert-circle');
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderRadius: 16,
        backgroundColor: color + '18',
        borderWidth: 1,
        borderColor: color + '55',
        alignItems: 'center',
      }}
    >
      <Ionicons name={ic} size={20} color={color} />
      <Text variant="caption" style={{ flex: 1, color: p.text }}>
        {text}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
          <Text variant="caption" weight="semibold" style={{ color }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- toast */
type ToastTone = 'success' | 'error' | 'info';
type ToastState = { message: string | null; tone: ToastTone; id: number; show: (m: string, tone?: ToastTone) => void };

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  id: 0,
  show: (message, tone = 'info') => set((s) => ({ message, tone, id: s.id + 1 })),
}));

export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};

export function ToastHost() {
  const { message, tone, id } = useToast();
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => useToast.setState({ message: null }), 3600);
    return () => clearTimeout(timer);
  }, [id, message]);
  if (!message) return null;
  const color = tone === 'success' ? p.success : tone === 'error' ? p.danger : p.primary;
  return (
    <Animated.View
      key={id}
      entering={FadeInDown}
      exiting={FadeOutUp}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 999 }}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        onPress={() => useToast.setState({ message: null })}
        style={{
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          padding: 14,
          borderRadius: 18,
          backgroundColor: p.surface,
          borderWidth: 1,
          borderColor: color + '88',
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Ionicons
          name={tone === 'success' ? 'checkmark-circle' : tone === 'error' ? 'alert-circle' : 'information-circle'}
          size={22}
          color={color}
        />
        <Text variant="caption" weight="medium" style={{ flex: 1 }}>
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
