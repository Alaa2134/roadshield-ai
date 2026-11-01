import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/illustrations';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from './Screen';
import { Text } from './Text';

export function AuthShell({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
}) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={isDark ? ['#0E2250', '#070F1E', '#070F1E'] : ['#D6E5FF', '#F2F5FB', '#F2F5FB']} style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top }}>{back ? <ScreenHeader back /> : null}</View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32, gap: 22, flexGrow: 1 }}
        >
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', gap: 12, marginTop: back ? 0 : 24 }}>
            <BrandMark size={84} />
            <Text variant="display" center accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text tone="muted" center>
                {subtitle}
              </Text>
            ) : null}
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ gap: 16 }}>
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
