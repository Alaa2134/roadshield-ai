import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { AUTH_REDIRECT } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_REDIRECT } });
    setBusy(false);
    if (error) setMessage({ tone: 'danger', text: errorMessage(error) });
    else {
      setMessage({ tone: 'success', text: t('auth.resent') });
      setCooldown(60);
    }
  };

  return (
    <AuthShell title={t('auth.verifyTitle')} subtitle={t('auth.verifyBody', { email })} back>
      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      <Button
        label={cooldown > 0 ? `${t('auth.resend')} (${cooldown})` : t('auth.resend')}
        icon="refresh"
        variant="secondary"
        onPress={resend}
        loading={busy}
        disabled={!email || cooldown > 0}
      />
      <Button label={t('auth.iVerified')} onPress={() => router.replace('/(auth)/sign-in')} />
    </AuthShell>
  );
}
