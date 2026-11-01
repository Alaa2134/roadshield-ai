import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { PriorityExplainer } from '@/components/report/HazardBits';
import { CategoryIcon, SeverityBadge, StatusBadge, TaskStatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/Controls';
import { EmptyState, Notice, SkeletonCard, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { getHazard, getHazardImages } from '@/lib/api/hazards';
import { signedUrls, uploadJpeg } from '@/lib/api/storage';
import { assignHazard, attachTaskImage, getTask, listOfficers, taskUpdates, updateTask } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { prepareImage } from '@/lib/images';
import { qk } from '@/lib/query';
import { openExternalNavigation } from '@/lib/routing';
import { HAZARD_BUCKET } from '@/lib/supabase';
import type { TaskStatus } from '@/lib/types';
import { useSession } from '@/stores/session';
import { severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { p } = useTheme();
  const client = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  const role = useSession((s) => s.role);
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState(false);

  const task = useQuery({ queryKey: qk.task(id), queryFn: () => getTask(id) });
  const hazardId = task.data?.hazard_id;
  const hazard = useQuery({ queryKey: qk.hazard(hazardId ?? ''), enabled: !!hazardId, queryFn: () => getHazard(hazardId!) });
  const updates = useQuery({ queryKey: ['task-updates', id], queryFn: () => taskUpdates(id) });
  const photos = useQuery({
    queryKey: ['task-photos', id],
    enabled: !!hazardId,
    queryFn: async () => {
      const rows = (await getHazardImages(hazardId!)).filter((r) => r.task_id === id && (r.kind === 'before' || r.kind === 'after'));
      const urls = await signedUrls(HAZARD_BUCKET, rows.map((r) => r.storage_path)).catch(() => ({}) as Record<string, string>);
      return rows.map((r) => ({ ...r, url: urls[r.storage_path] ?? null }));
    },
  });
  const officers = useQuery({ queryKey: ['officers'], enabled: role === 'admin' && picker, queryFn: listOfficers });

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: qk.task(id) });
    void client.invalidateQueries({ queryKey: ['task-updates', id] });
    void client.invalidateQueries({ queryKey: ['task-photos', id] });
    if (hazardId) void client.invalidateQueries({ queryKey: qk.hazard(hazardId) });
    void client.invalidateQueries({ queryKey: ['officer-queue'] });
  };

  const act = useMutation({
    mutationFn: ({ status, text }: { status: TaskStatus | null; text: string | null }) => updateTask(id, status, text),
    onSuccess: () => {
      setNote('');
      toast.success(t('common.saved'));
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addPhoto = useMutation({
    mutationFn: async ({ kind, camera }: { kind: 'before' | 'after'; camera: boolean }) => {
      if (camera) await ImagePicker.requestCameraPermissionsAsync();
      const res = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
      if (res.canceled || !res.assets[0] || !uid) return null;
      const a = res.assets[0];
      const img = await prepareImage(a.uri, a.width, a.height);
      const path = `${uid}/tasks/${id}/${kind}-${Date.now()}.jpg`;
      await uploadJpeg(HAZARD_BUCKET, path, img.uri);
      return attachTaskImage(id, path, kind, img.width, img.height, false);
    },
    onSuccess: (r) => {
      if (r) invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reassign = useMutation({
    mutationFn: (officerId: string) => assignHazard(hazardId!, officerId),
    onSuccess: (res) => {
      setPicker(false);
      toast.success(t('common.saved'));
      invalidate();
      router.replace(`/officer/task/${res.task_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (task.isLoading) {
    return (
      <Screen back title={t('officer.title')}>
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  const tk = task.data;
  const h = hazard.data;
  if (!tk) {
    return (
      <Screen back title={t('officer.title')}>
        <EmptyState title={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const mine = tk.assigned_to === uid;
  const admin = role === 'admin';
  const closed = tk.status === 'completed' || tk.status === 'cancelled';
  const before = (photos.data ?? []).filter((x) => x.kind === 'before');
  const after = (photos.data ?? []).filter((x) => x.kind === 'after');

  const choosePhoto = (kind: 'before' | 'after') =>
    Alert.alert(kind === 'before' ? t('officer.addBefore') : t('officer.addAfter'), undefined, [
      { text: t('report.takePhoto'), onPress: () => addPhoto.mutate({ kind, camera: true }) },
      { text: t('report.chooseLibrary'), onPress: () => addPhoto.mutate({ kind, camera: false }) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  return (
    <Screen back title={h?.public_code ?? t('officer.title')} subtitle={h ? t(`categories.${h.category}`) : undefined} refreshing={task.isRefetching} onRefresh={invalidate} keyboard>
      {h ? (
        <Card onPress={() => router.push(`/hazard/${h.id}`)}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <CategoryIcon category={h.category} color={severityColor(p, h.severity)} size={48} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="subheading">{t(`categories.${h.category}`)}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <TaskStatusBadge status={tk.status} />
                  <StatusBadge status={h.status} />
                  <SeverityBadge severity={h.severity} />
                </View>
              </View>
            </View>
            {h.description ? <Text variant="caption">{h.description}</Text> : null}
            <Text variant="caption" tone="muted">
              {[h.address, h.city].filter(Boolean).join(' · ')}
              {tk.due_date ? ` · ${t('officer.due', { date: formatDate(tk.due_date) })}` : ''}
            </Text>
          </View>
        </Card>
      ) : null}

      {h ? <Button variant="secondary" icon="navigate" label={t('map.directions')} onPress={() => void openExternalNavigation(h)} /> : null}

      {h?.priority ? (
        <Card>
          <PriorityExplainer priority={h.priority} />
        </Card>
      ) : null}

      {/* Status actions */}
      {!closed && (mine || admin) ? (
        <Section title={t('taskStatus.in_progress')}>
          {tk.status === 'assigned' ? <Button icon="play" label={t('officer.start')} onPress={() => act.mutate({ status: 'in_progress', text: note || null })} loading={act.isPending} /> : null}
          {tk.status === 'in_progress' ? (
            <>
              {after.length === 0 ? <Notice tone="info" text={t('officer.afterRequired')} /> : null}
              <Button
                icon="checkmark-done"
                label={t('officer.requestCompletion')}
                disabled={after.length === 0}
                onPress={() => act.mutate({ status: 'completion_requested', text: note || null })}
                loading={act.isPending}
              />
            </>
          ) : null}
          {tk.status === 'completion_requested' ? (
            <Button variant="secondary" icon="arrow-undo" label={t('officer.backToProgress')} onPress={() => act.mutate({ status: 'in_progress', text: note || null })} />
          ) : null}
          {admin ? (
            <View style={{ gap: 10 }}>
              {tk.status === 'completion_requested' ? (
                <Button variant="primary" icon="ribbon" label={t('officer.approve')} onPress={() => act.mutate({ status: 'completed', text: note || null })} loading={act.isPending} />
              ) : null}
              <Button variant="secondary" icon="people" label={t('officer.reassign')} onPress={() => setPicker(true)} />
              <Button
                variant="danger"
                icon="close-circle"
                label={t('officer.cancelTask')}
                onPress={() =>
                  Alert.alert(t('officer.cancelTask'), undefined, [
                    { text: t('common.no'), style: 'cancel' },
                    { text: t('common.yes'), style: 'destructive', onPress: () => act.mutate({ status: 'cancelled', text: note || null }) },
                  ])
                }
              />
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* Photos */}
      <Section title={`${t('officer.before')} / ${t('officer.after')}`}>
        {(['before', 'after'] as const).map((kind) => {
          const list = kind === 'before' ? before : after;
          return (
            <View key={kind} style={{ gap: 8 }}>
              <Text variant="label" tone="muted">
                {kind === 'before' ? t('officer.before') : t('officer.after')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {list.map((img) => (img.url ? <Image key={img.id} source={{ uri: img.url }} style={{ width: 140, height: 104, borderRadius: 14 }} contentFit="cover" /> : null))}
                {!closed && (mine || admin) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={kind === 'before' ? t('officer.addBefore') : t('officer.addAfter')}
                    onPress={() => choosePhoto(kind)}
                    style={{ width: 140, height: 104, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.border, alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Text variant="caption" tone="primary" weight="semibold" center>
                      {addPhoto.isPending && addPhoto.variables?.kind === kind ? t('common.loading') : `+ ${kind === 'before' ? t('officer.addBefore') : t('officer.addAfter')}`}
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          );
        })}
      </Section>

      {/* Notes */}
      {!closed && (mine || admin) ? (
        <Section title={t('officer.note')}>
          <Input placeholder={t('officer.notePh')} value={note} onChangeText={setNote} multiline maxLength={1000} />
          <Button variant="secondary" icon="create-outline" label={t('officer.addNote')} disabled={!note.trim()} onPress={() => act.mutate({ status: null, text: note.trim() })} />
        </Section>
      ) : null}

      {/* Updates */}
      <Section title={t('officer.updates')}>
        <Card>
          {(updates.data ?? []).map((u, i) => (
            <View key={u.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: p.border, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {u.status ? <TaskStatusBadge status={u.status} /> : null}
                <Text variant="caption" tone="muted">
                  {formatDateTime(u.created_at)}
                </Text>
              </View>
              {u.note ? <Text variant="caption">{u.note}</Text> : null}
            </View>
          ))}
        </Card>
      </Section>

      <Modal visible={picker} animationType="slide" transparent onRequestClose={() => setPicker(false)}>
        <View style={{ flex: 1, backgroundColor: p.overlay, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: p.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 10, maxHeight: '70%' }}>
            <Text variant="heading">{t('officer.chooseOfficer')}</Text>
            <ScrollView>
              {(officers.data ?? []).map((o) => (
                <ListRow
                  key={o.id}
                  icon="person-outline"
                  title={o.full_name || o.email}
                  subtitle={`${t(`profile.role_${o.role}`)} · ${t('officer.openTasks', { count: o.open_tasks })}`}
                  onPress={() => reassign.mutate(o.id)}
                />
              ))}
            </ScrollView>
            <Button variant="secondary" label={t('common.close')} onPress={() => setPicker(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
