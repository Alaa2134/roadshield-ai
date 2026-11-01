import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'surface' | 'hero' | 'glass' | 'outline';
  padded?: boolean;
  accessibilityLabel?: string;
};

export function Card({ children, style, onPress, variant = 'surface', padded = true, accessibilityLabel }: Props) {
  const { p, isDark } = useTheme();
  const base: ViewStyle = {
    borderRadius: 22,
    padding: padded ? 18 : 0,
    borderWidth: 1,
    borderColor: variant === 'hero' ? 'rgba(255,255,255,0.10)' : p.border,
    backgroundColor: variant === 'glass' ? p.glass : variant === 'outline' ? 'transparent' : p.surface,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: variant === 'outline' ? 0 : 3,
  };

  const content =
    variant === 'hero' ? (
      <LinearGradient
        colors={isDark ? ['#1A3A78', '#102A5C', '#0B1A38'] : ['#2F7DFF', '#1F6CF0', '#1650C4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: padded ? 20 : 0 }}
      >
        {children}
      </LinearGradient>
    ) : (
      children
    );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        style={({ pressed }) => [base, variant === 'hero' && { padding: 0 }, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[base, variant === 'hero' && { padding: 0 }, style]}>{content}</View>;
}
