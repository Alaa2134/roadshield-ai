import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useNetwork } from '@/stores/network';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function OfflineBanner() {
  const online = useNetwork((s) => s.online);
  const { p } = useTheme();
  const { t } = useTranslation();
  if (online) return null;
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} accessibilityLiveRegion="polite">
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 6,
          borderRadius: 14,
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: p.warning + '22',
          borderWidth: 1,
          borderColor: p.warning + '66',
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Ionicons name="cloud-offline-outline" size={18} color={p.warning} />
        <Text variant="caption" style={{ flex: 1, color: p.warning }}>
          {t('common.offlineBanner')}
        </Text>
      </View>
    </Animated.View>
  );
}
