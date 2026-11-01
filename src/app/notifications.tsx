import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { EmptyBellArt } from '@/components/illustrations';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useNotifications } from '@/hooks/data';
import { markRead } from '@/lib/api/profile';
import { timeAgo } from '@/lib/format';
import { notificationPermission, registerForPush, requestNotificationPermission } from '@/lib/notifications';
import { qk } from '@/lib/query';
import type { AppNotification, NotificationType } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import type { IconName } from '@/components/ui/Button';

const ICON: Record<NotificationType, IconName> = {
  report_confirmation: 'checkmark-done-outline',
  verification_update: 'shield-checkmark-outline',
  nearby_hazard: 'warning-outline',
  maintenance_progress: 'construct-outline',
  report_resolved: 'sparkles-outline',
  system_announcement: 'megaphone-outline',
};

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { p } = useTheme();
  const client = useQueryClient();
  const list = useNotifications();
  const permission = useQuery({ queryKey: ['push-permission'], queryFn: notificationPermission });

  const read = useMutation({
    mutationFn: (ids?: string[]) => markRead(ids),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.notifications });
      void client.invalidateQueries({ queryKey: qk.unread });
    },
  });

  const enable = useMutation({
    mutationFn: async () => {
      const state = await requestNotificationPermission();
      if (state === 'granted') return registerForPush();
      return state;
    },
    onSuccess: () => void permission.refetch(),
  });

  const ar = i18n.language === 'ar';
  const open = (n: AppNotification) => {
    if (!n.read_at) read.mutate([n.id]);
    const d = n.data as { hazard_id?: string; task_id?: string };
    if (d.task_id) router.push(`/officer/task/${d.task_id}`);
    else if (d.hazard_id) router.push(`/hazard/${d.hazard_id}`);
  };
  const unread = (list.data ?? []).some((n) => !n.read_at);

  return (
    <Screen
      back
      title={t('notifications.title')}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      right={unread ? <Button size="sm" full={false} variant="secondary" label={t('notifications.markAll')} onPress={() => read.mutate(undefined)} /> : undefined}
    >
      {permission.data === 'undetermined' ? (
        <Card>
          <View style={{ gap: 10 }}>
            <Text variant="subheading">{t('notifications.permissionTitle')}</Text>
            <Text variant="caption" tone="muted">
              {t('notifications.permissionBody')}
            </Text>
            <Button icon="notifications" label={t('notifications.allow')} onPress={() => enable.mutate()} loading={enable.isPending} />
          </View>
        </Card>
      ) : permission.data === 'denied' ? (
        <Notice tone="warning" text={t('notifications.pushDenied')} action={{ label: t('profile.title'), onPress: () => void Linking.openSettings() }} />
      ) : enable.data === 'not_configured' ? (
        <Notice tone="info" text={t('notifications.pushUnavailable')} />
      ) : null}

      {list.isLoading ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState illustration={<EmptyBellArt />} title={t('notifications.empty')} />
      ) : (
        (list.data ?? []).map((n) => (
          <Pressable key={n.id} accessibilityRole="button" onPress={() => open(n)}>
            <Card style={{ padding: 14, borderColor: n.read_at ? p.border : p.primary + '88' }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: p.primary + '1F', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICON[n.type]} size={20} color={n.type === 'nearby_hazard' ? p.warning : p.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text weight={n.read_at ? 'medium' : 'semibold'}>{ar ? n.title_ar : n.title_en}</Text>
                  <Text variant="caption" tone="muted">
                    {ar ? n.body_ar : n.body_en}
                  </Text>
                  <Text variant="label" tone="faint">
                    {timeAgo(n.created_at)}
                  </Text>
                </View>
                {!n.read_at ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.cyan, marginTop: 6 }} /> : null}
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
