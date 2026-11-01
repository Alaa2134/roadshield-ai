import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { deleteAccount } from '@/lib/api/profile';
import { stopBackgroundAlerts } from '@/lib/background';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

export default function DeleteAccount() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await stopBackgroundAlerts().catch(() => undefined);
      await deleteAccount();
      await supabase.auth.signOut({ scope: 'local' });
      queryClient.clear();
      toast.success(t('deleteAccount.deleted'));
      router.replace('/(auth)/sign-in');
    } catch (e) {
      const code = (e as Error).message;
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('deleteAccount.title')} keyboard>
      <Card style={{ borderColor: p.danger + '88' }}>
        <View style={{ gap: 10 }}>
          <Text weight="semibold" tone="danger">
            {t('deleteAccount.title')}
          </Text>
          <Text>{t('deleteAccount.body')}</Text>
        </View>
      </Card>
      <Input label={t('deleteAccount.typeToConfirm')} autoCapitalize="characters" value={confirm} onChangeText={setConfirm} />
      {error ? <Notice tone="danger" text={error} /> : null}
      <Button variant="danger" icon="trash" label={t('deleteAccount.action')} onPress={run} loading={busy} disabled={confirm.trim() !== 'DELETE'} />
    </Screen>
  );
}
