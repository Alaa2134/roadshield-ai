import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Deep link target for email verification and password recovery:
 *   roadshield://auth/callback?code=…            (sign-up confirmation)
 *   roadshield://auth/callback?next=reset&code=… (password recovery)
 * The PKCE code is exchanged for a session on this device.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const params = useLocalSearchParams<{ code?: string; next?: string; error_description?: string }>();
  const [failed, setFailed] = useState<string | null>(params.error_description ?? null);

  useEffect(() => {
    if (!params.code) {
      if (!params.error_description) setFailed(t('auth.linkInvalid'));
      return;
    }
    void supabase.auth.exchangeCodeForSession(params.code).then(({ error }) => {
      if (error) return setFailed(t('auth.linkInvalid'));
      if (params.next === 'reset') {
        useSession.setState({ recovering: true });
        router.replace('/(auth)/reset-password');
      } else {
        router.replace('/(tabs)');
      }
    });
  }, [params.code, params.next, params.error_description, t]);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      {failed ? (
        <>
          <Notice tone="danger" text={failed} />
          <Button label={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} />
        </>
      ) : (
        <ActivityIndicator size="large" color={p.primary} />
      )}
    </View>
  );
}
