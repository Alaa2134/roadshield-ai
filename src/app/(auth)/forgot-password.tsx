import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { AUTH_REDIRECT } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { forgotSchema, type ForgotValues } from '@/lib/validation';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: params.email ?? '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${AUTH_REDIRECT}?next=reset` });
    if (e) return setError(errorMessage(e));
    setSentTo(email);
  });

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')} back>
      {sentTo ? <Notice tone="success" text={t('auth.resetSent', { email: sentTo })} /> : null}
      {error ? <Notice tone="danger" text={error} /> : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Input
            label={t('auth.email')}
            icon="mail-outline"
            autoCapitalize="none"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error ? t(fieldState.error.message ?? 'auth.v_email') : undefined}
          />
        )}
      />
      <Button size="lg" label={t('auth.sendReset')} icon="send" onPress={onSubmit} loading={formState.isSubmitting} />
    </AuthShell>
  );
}
