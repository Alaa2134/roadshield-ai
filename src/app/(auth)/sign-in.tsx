import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { errorCode, errorMessage } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { signInSchema, type SignInValues } from '@/lib/validation';

export default function SignIn() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState, getValues } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) {
      haptic.error();
      if (errorCode(e) === 'emailNotConfirmed') {
        router.push({ pathname: '/(auth)/verify-email', params: { email } });
        return;
      }
      setError(errorMessage(e));
      return;
    }
    haptic.success();
    router.replace('/(tabs)');
  });

  return (
    <AuthShell title={t('auth.welcomeBack')} subtitle={t('auth.signInSubtitle')}>
      {error ? <Notice tone="danger" text={error} /> : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Input
            label={t('auth.email')}
            icon="mail-outline"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error ? t(fieldState.error.message ?? 'auth.v_email') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Input
            label={t('auth.password')}
            icon="lock-closed-outline"
            secure
            autoComplete="current-password"
            textContentType="password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => void onSubmit()}
            error={fieldState.error ? t(fieldState.error.message ?? 'auth.v_password') : undefined}
          />
        )}
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email: getValues('email') } })}
        style={{ alignSelf: 'flex-end' }}
        hitSlop={8}
      >
        <Text variant="caption" tone="primary" weight="semibold">
          {t('auth.forgot')}
        </Text>
      </Pressable>
      <Button size="lg" label={t('auth.signIn')} onPress={onSubmit} loading={formState.isSubmitting} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text tone="muted">{t('auth.noAccount')}</Text>
        <Link href="/(auth)/sign-up" accessibilityRole="link">
          <Text weight="semibold" tone="primary">
            {t('auth.signUp')}
          </Text>
        </Link>
      </View>
    </AuthShell>
  );
}
