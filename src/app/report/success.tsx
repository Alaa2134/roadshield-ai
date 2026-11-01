import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

export default function ReportSuccess() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, code, queued } = useLocalSearchParams<{ id?: string; code?: string; queued?: string }>();
  const isQueued = queued === '1';
  const color = isQueued ? p.warning : p.success;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: 24, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: 18, marginTop: 40 }}>
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={isQueued ? 'cloud-upload' : 'checkmark'} size={46} color="#fff" />
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(200)} style={{ gap: 10, alignItems: 'center' }}>
          <Text variant="display" center accessibilityRole="header">
            {isQueued ? t('report.successQueuedTitle') : t('report.successTitle')}
          </Text>
          <Text tone="muted" center>
            {isQueued ? t('report.successQueuedBody') : t('report.successBody', { code: code ?? '' })}
          </Text>
          {code ? (
            <View style={{ marginTop: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border }}>
              <Text variant="label" tone="muted">
                {t('hazard.code')}
              </Text>
              <Text variant="heading" selectable center>
                {code}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(350)} style={{ gap: 12 }}>
        {id ? <Button size="lg" icon="git-commit-outline" label={t('report.trackReport')} onPress={() => router.replace(`/hazard/${id}`)} /> : null}
        <Button variant="secondary" label={t('report.reportAnother')} onPress={() => router.replace('/report/new')} />
        <Button variant="ghost" label={t('common.done')} onPress={() => router.replace('/(tabs)')} />
      </Animated.View>
    </View>
  );
}
