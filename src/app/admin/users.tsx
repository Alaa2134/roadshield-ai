import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';
import { Chip, Pill } from '@/components/ui/Badges';
import { Card } from '@/components/ui/Card';
import { Notice, SkeletonCard, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { listUsers, setRole, setSuspended } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/query';
import type { AdminUser, UserRole } from '@/lib/types';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

const ROLES: UserRole[] = ['citizen', 'maintenance_officer', 'admin'];

export default function Users() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const client = useQueryClient();
  const me = useSession((s) => s.session?.user.id);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRoleFilter] = useState<UserRole | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const users = useQuery({ queryKey: qk.users(debounced, role), queryFn: () => listUsers(debounced, role) });
  const done = () => void client.invalidateQueries({ queryKey: ['admin-users'] });

  const changeRole = useMutation({
    mutationFn: ({ id, r }: { id: string; r: UserRole }) => setRole(id, r),
    onSuccess: () => {
      toast.success(t('common.saved'));
      done();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const suspend = useMutation({
    mutationFn: ({ id, s }: { id: string; s: boolean }) => setSuspended(id, s),
    onSuccess: done,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pickRole = (u: AdminUser) =>
    Alert.alert(
      t('admin.changeRole'),
      u.full_name || u.email,
      [
        ...ROLES.filter((r) => r !== u.role).map((r) => ({ text: t(`profile.role_${r}`), onPress: () => changeRole.mutate({ id: u.id, r }) })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    );

  return (
    <Screen back title={t('admin.users')} refreshing={users.isRefetching} onRefresh={() => void users.refetch()}>
      <Input icon="search" placeholder={t('common.search')} value={search} onChangeText={setSearch} autoCapitalize="none" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t('map.allCategories')} selected={!role} onPress={() => setRoleFilter(null)} />
        {ROLES.map((r) => (
          <Chip key={r} label={t(`profile.role_${r}`)} selected={role === r} onPress={() => setRoleFilter(role === r ? null : r)} />
        ))}
      </ScrollView>
      {users.error ? <Notice tone="danger" text={errorMessage(users.error)} /> : null}
      {users.isLoading ? (
        <SkeletonCard />
      ) : (
        (users.data ?? []).map((u) => (
          <Card key={u.id} style={{ padding: 14 }}>
            <View style={{ gap: 8 }}>
              <Text weight="semibold">{u.full_name || '—'}</Text>
              <Text variant="caption" tone="muted">
                {u.email} · {formatDate(u.created_at)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Pill label={t(`profile.role_${u.role}`)} color={u.role === 'admin' ? p.danger : u.role === 'maintenance_officer' ? p.cyan : p.primary} />
                {!u.email_confirmed ? <Pill label={t('admin.unverifiedEmail')} color={p.warning} /> : null}
                {u.suspended_at ? <Pill label={t('admin.suspended')} color={p.danger} /> : null}
                <Pill label={`${t('profile.reportsSubmitted')}: ${u.report_count}`} color={p.textMuted} />
                {u.open_tasks ? <Pill label={t('officer.openTasks', { count: u.open_tasks })} color={p.cyan} /> : null}
              </View>
              {u.id !== me ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip label={t('admin.changeRole')} icon="swap-horizontal" onPress={() => pickRole(u)} />
                  <Chip
                    label={u.suspended_at ? t('admin.unsuspend') : t('admin.suspend')}
                    icon={u.suspended_at ? 'lock-open-outline' : 'lock-closed-outline'}
                    onPress={() => suspend.mutate({ id: u.id, s: !u.suspended_at })}
                  />
                </View>
              ) : null}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
