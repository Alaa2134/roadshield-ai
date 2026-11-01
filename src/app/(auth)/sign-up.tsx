import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { AUTH_REDIRECT } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { signUpSchema, type SignUpValues } from '@/lib/validation';

export default function SignUp() {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ fullName, email, password }) => {
    setError(null);
    const { data, error: e } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: AUTH_REDIRECT,
        data: { full_name: fullName.trim(), locale: i18n.language === 'ar' ? 'ar' : 'en' },
      },
    });
    if (e) {
      haptic.error();
      setError(errorMessage(e));
      return;
    }
    haptic.success();
    // With email confirmation enabled there is no session until the link is opened.
    if (!data.session) router.replace({ pathname: '/(auth)/verify-email', params: { email } });
    else router.replace('/(tabs)');
  });

  const field = (name: keyof SignUpValues, props: Partial<React.ComponentProps<typeof Input>>) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => (
        <Input
          value={f.value}
          onChangeText={f.onChange}
          onBlur={f.onBlur}
          error={fieldState.error ? t(fieldState.error.message ?? 'errors.VALIDATION_ERROR') : undefined}
          {...props}
        />
      )}
    />
  );

  return (
    <AuthShell title={t('auth.signUp')} subtitle={t('auth.createSubtitle')} back>
      {error ? <Notice tone="danger" text={error} /> : null}
      {field('fullName', { label: t('auth.fullName'), icon: 'person-outline', autoComplete: 'name', textContentType: 'name' })}
      {field('email', {
        label: t('auth.email'),
        icon: 'mail-outline',
        autoCapitalize: 'none',
        keyboardType: 'email-address',
        autoComplete: 'email',
        textContentType: 'emailAddress',
      })}
      {field('password', {
        label: t('auth.password'),
        icon: 'lock-closed-outline',
        secure: true,
        autoComplete: 'new-password',
        textContentType: 'newPassword',
        hint: t('auth.v_password'),
      })}
      {field('confirm', { label: t('auth.confirmPassword'), icon: 'lock-closed-outline', secure: true, textContentType: 'newPassword' })}
      <Text variant="caption" tone="faint">
        {t('auth.terms')}
      </Text>
      <Button size="lg" label={t('auth.signUp')} onPress={onSubmit} loading={formState.isSubmitting} />
    </AuthShell>
  );
}
