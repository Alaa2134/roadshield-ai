import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { toast } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ListRow } from '@/components/ui/Controls';
import { router } from 'expo-router';
import { clearHazardCache } from '@/lib/offline/cache';
import { queryClient } from '@/lib/query';
import { useTheme } from '@/theme/ThemeProvider';

export default function Privacy() {
  const { t } = useTranslation();
  const { p } = useTheme();
  return (
    <Screen back title={t('privacyScreen.title')}>
      <Card>
        <View style={{ gap: 14 }}>
          {(['body1', 'body2', 'body3'] as const).map((k) => (
            <Text key={k}>{t(`privacyScreen.${k}`)}</Text>
          ))}
        </View>
      </Card>
      <Card>
        <ListRow icon="warning-outline" iconColor={p.warning} title={t('warnings.settingsTitle')} subtitle={t('warnings.background')} onPress={() => router.push('/settings/warnings')} />
      </Card>
      <Button
        variant="secondary"
        icon="trash-bin-outline"
        label={t('privacyScreen.clearCache')}
        onPress={async () => {
          await clearHazardCache();
          queryClient.clear();
          toast.success(t('privacyScreen.cacheCleared'));
        }}
      />
      <Button variant="danger" icon="trash-outline" label={t('profile.deleteAccount')} onPress={() => router.push('/settings/delete-account')} />
    </Screen>
  );
}
