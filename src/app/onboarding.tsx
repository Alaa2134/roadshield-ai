import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View, useWindowDimensions, type ListViewToken } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityArt, DetectArt, MapArt, WelcomeArt } from '@/components/illustrations';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics';
import { useSettings } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

const SLIDES = [
  { key: 's1', Art: WelcomeArt },
  { key: 's2', Art: DetectArt },
  { key: 's3', Art: MapArt },
  { key: 's4', Art: CommunityArt },
] as const;

function Dot({ active }: { active: boolean }) {
  const { p } = useTheme();
  const style = useAnimatedStyle(() => ({
    width: withSpring(active ? 26 : 8, { damping: 18 }),
    backgroundColor: active ? p.cyan : p.textFaint,
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4 }, style]} />;
}

export default function Onboarding() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark, isRTL, reduceMotion } = useTheme();
  const [index, setIndex] = useState(0);
  // The first slide's text is shown immediately; only slides reached by swiping animate in.
  // (An entering animation on the very first frame can stay invisible on some devices, e.g.
  // with system animations turned off.)
  const [moved, setMoved] = useState(false);
  const list = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const finish = useSettings((s) => s.setOnboardingDone);

  const done = () => {
    haptic.success();
    finish();
    router.replace('/(auth)/sign-in');
  };

  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (typeof i === 'number') {
      setIndex(i);
      if (i > 0) setMoved(true);
    }
  }).current;

  const last = index === SLIDES.length - 1;

  return (
    <LinearGradient colors={isDark ? ['#0B1A38', '#070F1E', '#070F1E'] : ['#DCE8FF', '#F2F5FB', '#F2F5FB']} style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
          {t('onboarding.progress', { current: index + 1, total: SLIDES.length })}
        </Text>
        {!last ? (
          <Pressable accessibilityRole="button" onPress={done} hitSlop={12}>
            <Text weight="semibold" tone="primary">
              {t('common.skip')}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <View style={{ width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 26 }}>
            <item.Art size={Math.min(300, width * 0.78)} />
            {i === index ? (
              <Animated.View
                entering={moved && !reduceMotion ? FadeInDown.duration(450) : undefined}
                style={{ gap: 10, alignItems: 'center' }}
              >
                <Text variant="display" center>
                  {t(`onboarding.${item.key}Title`)}
                </Text>
                <Text tone="muted" center style={{ maxWidth: 340 }}>
                  {t(`onboarding.${item.key}Body`)}
                </Text>
              </Animated.View>
            ) : (
              <View style={{ height: 120 }} />
            )}
          </View>
        )}
      />

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20, gap: 22 }}>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }} accessibilityElementsHidden>
          {SLIDES.map((s, i) => (
            <Dot key={s.key} active={i === index} />
          ))}
        </View>
        <Button
          size="lg"
          label={last ? t('onboarding.getStarted') : t('common.next')}
          iconRight={last ? undefined : isRTL ? 'arrow-back' : 'arrow-forward'}
          onPress={() => {
            if (last) return done();
            list.current?.scrollToIndex({ index: index + 1, animated: true });
          }}
        />
      </View>
    </LinearGradient>
  );
}
