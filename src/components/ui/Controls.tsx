import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Switch, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import type { IconName } from './Button';
import { Text } from './Text';

/* ----------------------------------------------------------------- segmented control */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { p } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: p.surface2, borderRadius: 16, padding: 4, gap: 4 }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: active ? p.surface : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: p.border,
            }}
          >
            <Text variant="caption" weight={active ? 'semibold' : 'medium'} tone={active ? 'default' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ----------------------------------------------------------------- list rows */
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  right,
  danger,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const { p, isRTL } = useTheme();
  const color = danger ? p.danger : (iconColor ?? p.primary);
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: color + '1F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={color} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text weight="medium" tone={danger ? 'danger' : 'default'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" tone="muted">
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && !right ? <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={p.textFaint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { p } = useTheme();
  return (
    <ListRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      right={
        <Switch
          accessibilityLabel={title}
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            haptic.tap();
            onChange(v);
          }}
          trackColor={{ true: p.primary, false: p.surface2 }}
          thumbColor="#FFFFFF"
        />
      }
    />
  );
}

export function Divider() {
  const { p } = useTheme();
  return <View style={{ height: 1, backgroundColor: p.border, opacity: 0.7 }} />;
}

/* ----------------------------------------------------------------- animated statistics */
export function AnimatedStat({ value, label, color }: { value: number; label: string; color?: string }) {
  const { p, reduceMotion } = useTheme();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: reduceMotion ? 0 : 700, easing: Easing.out(Easing.cubic) });
  }, [value, progress, reduceMotion]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  return (
    <View style={{ flex: 1, gap: 4 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="stat" style={{ color: color ?? p.text }}>
        {formatNumber(value)}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Animated.View
        style={[{ height: 3, borderRadius: 2, backgroundColor: color ?? p.primary, transformOrigin: 'left' }, bar]}
      />
    </View>
  );
}

/* ----------------------------------------------------------------- bottom sheet */
/**
 * Draggable bottom sheet with two snap points (peek / expanded), built on Gesture Handler v3
 * hooks and Reanimated so the drag runs on the UI thread.
 */
export function BottomSheet({
  children,
  peek = 170,
  expandedRatio = 0.62,
  onExpandedChange,
}: {
  children: ReactNode;
  peek?: number;
  expandedRatio?: number;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { p, reduceMotion } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const full = Math.round(height * expandedRatio);
  const collapsedY = full - peek;
  const y = useSharedValue(collapsedY);
  const start = useSharedValue(collapsedY);

  useEffect(() => {
    y.value = collapsedY;
  }, [collapsedY, y]);

  const notify = (expanded: boolean) => {
    haptic.tap();
    onExpandedChange?.(expanded);
  };

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onActivate: () => {
      'worklet';
      start.value = y.value;
    },
    onUpdate: (e) => {
      'worklet';
      y.value = Math.max(0, Math.min(collapsedY, start.value + e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      const expand = e.velocityY < -500 || (e.velocityY < 500 && y.value < collapsedY / 2);
      const target = expand ? 0 : collapsedY;
      y.value = reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, { damping: 22, stiffness: 220 });
      runOnJS(notify)(expand);
    },
  });

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const toggle = () => {
    const expand = y.value > collapsedY / 2;
    y.value = withSpring(expand ? 0 : collapsedY, { damping: 22, stiffness: 220 });
    notify(expand);
  };

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: full + insets.bottom,
          backgroundColor: p.glass,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderWidth: 1,
          borderColor: p.border,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16,
        },
        sheet,
      ]}
    >
      <GestureDetector gesture={pan}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Expand or collapse panel"
          onPress={toggle}
          style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}
        >
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: p.textFaint, opacity: 0.6 }} />
        </Pressable>
      </GestureDetector>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>{children}</View>
    </Animated.View>
  );
}
