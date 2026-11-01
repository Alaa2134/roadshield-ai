import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg' | 'sm';
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  children?: ReactNode;
  testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  size = 'md',
  full = true,
  style,
  accessibilityHint,
  testID,
}: Props) {
  const { p, reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;
  const height = size === 'lg' ? 56 : size === 'sm' ? 38 : 48;
  const fg = variant === 'secondary' || variant === 'ghost' ? p.text : '#FFFFFF';
  const solid: Record<Variant, string[]> = {
    primary: [p.primary, '#1A5FE0'],
    danger: [p.danger, '#C92F3D'],
    warning: [p.warning, '#E57A1E'],
    secondary: [p.surface2, p.surface2],
    ghost: ['transparent', 'transparent'],
  };
  const [c1, c2] = solid[variant] as [string, string];

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.97, { damping: 18, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={[{ alignSelf: full ? 'stretch' : 'flex-start', opacity: inactive ? 0.55 : 1 }, animated, style]}
    >
      <LinearGradient
        colors={[c1, c2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height,
          borderRadius: height / 2,
          paddingHorizontal: size === 'sm' ? 14 : 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: variant === 'secondary' || variant === 'ghost' ? 1 : 0,
          borderColor: variant === 'ghost' ? 'transparent' : p.border,
        }}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
            <Text variant={size === 'sm' ? 'caption' : 'subheading'} weight="semibold" style={{ color: fg }} numberOfLines={1}>
              {label}
            </Text>
            {iconRight ? <Ionicons name={iconRight} size={18} color={fg} /> : null}
          </>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'default',
  size = 42,
  badge,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary' | 'glass';
  size?: number;
  badge?: number;
}) {
  const { p } = useTheme();
  const bg = tone === 'primary' ? p.primary : tone === 'glass' ? p.glass : p.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: tone === 'primary' ? 0 : 1,
        borderColor: p.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Ionicons name={icon} size={size * 0.48} color={tone === 'primary' ? '#FFFFFF' : p.text} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            end: -2,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: p.danger,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text variant="label" style={{ color: '#fff', fontSize: 10, lineHeight: 13 }}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
