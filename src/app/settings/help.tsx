import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { env } from '@/lib/env';
import { useTheme } from '@/theme/ThemeProvider';

export default function Help() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen back title={t('help.title')}>
      {[1, 2, 3].map((n) => (
        <Card key={n}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === n }} onPress={() => setOpen(open === n ? null : n)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text weight="semibold" style={{ flex: 1 }}>
              {t(`help.q${n}`)}
            </Text>
            <Ionicons name={open === n ? 'chevron-up' : 'chevron-down'} size={18} color={p.textMuted} />
          </Pressable>
          {open === n ? (
            <Animated.View entering={FadeIn}>
              <Text tone="muted" style={{ marginTop: 10 }}>
                {t(`help.a${n}`)}
              </Text>
            </Animated.View>
          ) : null}
        </Card>
      ))}
      {env.supportEmail ? (
        <View>
          <Button icon="mail-outline" label={t('help.contact')} onPress={() => void Linking.openURL(`mailto:${env.supportEmail}?subject=RoadShield%20AI`)} />
        </View>
      ) : null}
    </Screen>
  );
}
