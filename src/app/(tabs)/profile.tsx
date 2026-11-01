import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Badges';
import { Card } from '@/components/ui/Card';
import { Divider, ListRow, Segmented } from '@/components/ui/Controls';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useMyStats } from '@/hooks/data';
import { stopBackgroundAlerts } from '@/lib/background';
import { applyDirection, reloadApp } from '@/lib/i18n';
import { unregisterPush } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { isStaff, useSession } from '@/stores/session';
import { useSettings, type Language, type ThemePreference } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import i18n from '@/lib/i18n';

export default function Profile() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  const profile = useSession((s) => s.profile);
  const role = useSession((s) => s.role);
  const stats = useMyStats();
  const language = useSettings((s) => s.language) ?? (i18n.language === 'ar' ? 'ar' : 'en');
  const setLanguage = useSettings((s) => s.setLanguage);
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  const changeLanguage = (lang: Language) => {
    if (lang === language) return;
    const run = async () => {
      setLanguage(lang);
      const uid = session?.user.id;
      if (uid) await supabase.from('profiles').update({ locale: lang }).eq('id', uid);
      void i18n.changeLanguage(lang);
      if (applyDirection(lang)) await reloadApp();
    };
    Alert.alert(t('profile.language'), t('profile.languageRestart'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.continue'), onPress: () => void run() },
    ]);
  };

  const signOut = async () => {
    await stopBackgroundAlerts().catch(() => undefined);
    await unregisterPush();
    await supabase.auth.signOut();
    client.clear();
    router.replace('/(auth)/sign-in');
  };

  const s = stats.data;
  return (
    <Screen title={t('profile.title')} refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()}>
      <Card variant="hero" onPress={() => router.push('/settings/profile')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar path={profile?.avatar_path} name={profile?.full_name ?? ''} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading" style={{ color: '#fff' }} numberOfLines={1}>
              {profile?.full_name || session?.user.email}
            </Text>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>
              {session?.user.email}
            </Text>
            <Pill label={t(`profile.role_${role}`)} color="#FFFFFF" />
          </View>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </View>
      </Card>

      <Section title={t('profile.participation')}>
        <Card>
          {s ? (
            <View style={{ gap: 4 }}>
              <ListRow icon="document-text-outline" title={t('profile.reportsSubmitted')} value={String(s.total)} onPress={() => router.push(isStaff(role) ? '/my-reports' : '/(tabs)/reports')} />
              <ListRow icon="shield-checkmark-outline" iconColor={p.cyan} title={t('profile.reportsVerified')} value={String(s.active)} />
              <ListRow icon="checkmark-done-outline" iconColor={p.success} title={t('profile.reportsResolved')} value={String(s.resolved)} />
              <ListRow icon="hand-left-outline" iconColor={p.warning} title={t('profile.confirmationsGiven')} value={String(s.confirmations_given)} />
              <Text variant="caption" tone="faint">
                {t('profile.participationNote')}
              </Text>
            </View>
          ) : (
            <Text tone="muted">{t('common.loading')}</Text>
          )}
        </Card>
      </Section>

      <Card>
        <ListRow icon="bookmark-outline" title={t('profile.savedPlaces')} onPress={() => router.push('/settings/places')} />
        <Divider />
        <ListRow icon="notifications-outline" title={t('profile.notificationPrefs')} onPress={() => router.push('/settings/notifications')} />
        <Divider />
        <ListRow icon="warning-outline" iconColor={p.warning} title={t('warnings.settingsTitle')} onPress={() => router.push('/settings/warnings')} />
        <Divider />
        <ListRow icon="lock-closed-outline" title={t('profile.privacy')} onPress={() => router.push('/settings/privacy')} />
        <Divider />
        <ListRow icon="help-circle-outline" title={t('profile.help')} onPress={() => router.push('/settings/help')} />
      </Card>

      <Section title={t('profile.language')}>
        <Segmented<Language>
          value={language}
          onChange={changeLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ar', label: 'العربية' },
          ]}
        />
      </Section>

      <Section title={t('profile.theme')}>
        <Segmented<ThemePreference>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('profile.themeSystem') },
            { value: 'dark', label: t('profile.themeDark') },
            { value: 'light', label: t('profile.themeLight') },
          ]}
        />
      </Section>

      <Card>
        <ListRow icon="log-out-outline" title={t('auth.signOut')} onPress={() => void signOut()} />
        <Divider />
        <ListRow icon="trash-outline" danger title={t('profile.deleteAccount')} onPress={() => router.push('/settings/delete-account')} />
      </Card>

      <Text variant="caption" tone="faint" center>
        {t('common.appName')} · {t('profile.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>
    </Screen>
  );
}
