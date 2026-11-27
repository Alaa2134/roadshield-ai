import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { EmptyMapArt } from '@/components/illustrations';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Controls';
import { EmptyState, Notice, SkeletonCard } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { FIELD_ROLES, myOrganizations, myWorkOrders, pendingInspections, type WorkOrder } from '@/lib/api/field';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { discard, flushOutbox, listOutbox, useOutbox } from '@/lib/offline/fieldOutbox';
import { useFieldOrg } from '@/stores/field';
import { useTheme } from '@/theme/ThemeProvider';

function WorkOrderCard({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const { p } = useTheme();
  const tone = wo.status === 'rejected' ? p.danger : wo.status === 'submitted' ? p.warning : p.cyan;
  return (
    <Card onPress={() => router.push(`/field/work-order/${wo.id}`)} accessibilityLabel={`${wo.code} ${wo.title}`}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: p.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="construct-outline" size={20} color={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="semibold" numberOfLines={1}>{wo.title}</Text>
            <Text variant="caption" tone="muted">{wo.code}{wo.due_date ? ` · ${t('field.due', { date: formatDate(wo.due_date) })}` : ''}</Text>
          </View>
          <Text variant="caption" weight="semibold" style={{ color: tone }}>{t(`field.statuses.${wo.status}`)}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: p.surface2, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: wo.progress_pct }}>
          <View style={{ width: `${wo.progress_pct}%`, height: '100%', backgroundColor: p.cyan }} />
        </View>
      </View>
    </Card>
  );
}

export default function FieldHome() {
  const { t, i18n } = useTranslation();
  const { p } = useTheme();
  const { org, setOrg } = useFieldOrg();
  const outbox = useOutbox();
  const orgs = useQuery({ queryKey: ['field-orgs'], queryFn: myOrganizations });
  const fieldOrgs = (orgs.data ?? []).filter((m) => FIELD_ROLES.includes(m.role));
  useEffect(() => {
    if (!org && fieldOrgs[0]) setOrg(fieldOrgs[0]);
  }, [org, fieldOrgs, setOrg]);
  const wos = useQuery({ queryKey: ['field-wos', org?.org_id], queryFn: () => myWorkOrders(org!.org_id), enabled: !!org });
  const pending = useQuery({ queryKey: ['field-pending', org?.org_id], queryFn: () => pendingInspections(org!.org_id), enabled: !!org && org.role !== 'contractor' });
  const items = useQuery({ queryKey: ['field-outbox', outbox.pending, outbox.syncing], queryFn: listOutbox });
  const name = org ? (i18n.language === 'ar' && org.name_ar ? org.name_ar : org.name) : '';

  return (
    <Screen back title={t('field.title')} subtitle={org ? t('field.subtitle', { org: name }) : undefined}
      refreshing={wos.isRefetching} onRefresh={() => { void wos.refetch(); void flushOutbox(true); }}>
      {orgs.error ? <Notice tone="danger" text={errorMessage(orgs.error)} /> : null}
      {fieldOrgs.length > 1 ? (
        <Segmented value={org?.org_id ?? ''} onChange={(id) => setOrg(fieldOrgs.find((o) => o.org_id === id) ?? null)}
          options={fieldOrgs.map((o) => ({ value: o.org_id, label: o.name }))} />
      ) : null}
      {org ? <Text variant="caption" tone="muted">{t('field.role', { role: t(`field.roles.${org.role}`) })}</Text> : null}

      <Card variant="hero" style={{ backgroundColor: p.primary }}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={outbox.pending ? 'cloud-upload-outline' : 'cloud-done-outline'} size={22} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text weight="semibold" style={{ color: '#FFFFFF' }}>{t('field.sync')}</Text>
              <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {outbox.syncing ? t('field.syncing') : outbox.pending ? t('field.pending', { count: outbox.pending }) : t('field.synced')}
              </Text>
            </View>
            {outbox.pending ? <Button size="sm" full={false} variant="secondary" label={t('field.syncNow')} onPress={() => void flushOutbox(true)} /> : null}
          </View>
          {(items.data ?? []).filter((i) => i.status === 'failed').map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="alert-circle" size={16} color="#FFD27A" />
              <Text variant="caption" style={{ flex: 1, color: '#FFFFFF' }} numberOfLines={2}>{t('field.failed')}: {i.label} · {i.last_error}</Text>
              <Button size="sm" full={false} variant="ghost" label={t('field.discard')} onPress={() => void discard(i.id)} />
            </View>
          ))}
        </View>
      </Card>

      {org && org.role !== 'contractor' ? (
        <View style={{ gap: 8 }}>
          <Button icon="clipboard-outline" label={t('field.newInspection')} onPress={() => router.push('/field/inspect')} testID="field-new-inspection" />
          {pending.data ? <Text variant="caption" tone="muted" center>{t('field.pendingReview', { count: pending.data })}</Text> : null}
        </View>
      ) : null}

      <Section title={t('field.workOrders')}>
        {wos.isLoading ? <><SkeletonCard /><SkeletonCard /></> : (wos.data ?? []).length === 0
          ? <EmptyState illustration={<EmptyMapArt />} title={t('field.noWorkOrders')} />
          : (wos.data ?? []).map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
      </Section>
    </Screen>
  );
}
