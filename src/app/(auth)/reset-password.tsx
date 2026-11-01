import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { Notice, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { resetSchema, type ResetValues } from '@/lib/validation';
import { useSession } from '@/stores/session';

export default function ResetPassword() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) return setError(errorMessage(e));
    useSession.setState({ recovering: false });
    toast.success(t('auth.passwordUpdated'));
    router.replace('/(tabs)');
  });

  return (
    <AuthShell title={t('auth.newPassword')} subtitle={t('auth.resetSubtitle')}>
      {!session ? <Notice tone="warning" text={t('auth.linkInvalid')} /> : null}
      {error ? <Notice tone="danger" text={error} /> : null}
      {(['password', 'confirm'] as const).map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field, fieldState }) => (
            <Input
              label={name === 'password' ? t('auth.newPassword') : t('auth.confirmPassword')}
              icon="lock-closed-outline"
              secure
              textContentType="newPassword"
              value={field.value}
              onChangeText={field.onChange}
              error={fieldState.error ? t(fieldState.error.message ?? 'auth.v_password') : undefined}
            />
          )}
        />
      ))}
      <Button size="lg" label={t('auth.setNewPassword')} onPress={onSubmit} loading={formState.isSubmitting} disabled={!session} />
    </AuthShell>
  );
}
