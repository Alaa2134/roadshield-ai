import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, View } from 'react-native';
import { AnnotatedImage } from '@/components/report/AiResultView';
import { PriorityExplainer } from '@/components/report/HazardBits';
import { Chip, Pill, SeverityBadge, StatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListRow, ToggleRow } from '@/components/ui/Controls';
import { EmptyState, Notice, SkeletonCard, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { findDuplicates, getAiDetection, getHazard, getHazardImages } from '@/lib/api/hazards';
import { signedUrls } from '@/lib/api/storage';
import { assignHazard, listOfficers, setImagePrivacy, setTrafficExposure, transitionHazard } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDistance } from '@/lib/format';
import { qk } from '@/lib/query';
import { HAZARD_BUCKET } from '@/lib/supabase';
import type { ReportStatus } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';

export default function ModerateHazard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { p } = useTheme();
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [approveImages, setApproveImages] = useState(true);
  const [officerPicker, setOfficerPicker] = useState(false);

  const hazard = useQuery({ queryKey: qk.hazard(id), queryFn: () => getHazard(id) });
  const h = hazard.data;
  const images = useQuery({
    queryKey: qk.images(id),
    queryFn: async () => {
      const rows = await getHazardImages(id);
      const urls = await signedUrls(HAZARD_BUCKET, rows.map((r) => r.storage_path)).catch(() => ({}) as Record<string, string>);
      return rows.map((r) => ({ ...r, url: urls[r.storage_path] ?? null }));
    },
  });
  const ai = useQuery({ queryKey: ['ai', h?.ai_detection_id], enabled: !!h?.ai_detection_id, queryFn: () => getAiDetection(h!.ai_detection_id!) });
  const dups = useQuery({
    queryKey: ['dups', id],
    enabled: !!h,
    queryFn: async () => (await findDuplicates(h!.latitude, h!.longitude, null, 80)).filter((d) => d.id !== id),
  });
  const officers = useQuery({ queryKey: ['officers'], enabled: officerPicker, queryFn: listOfficers });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: qk.hazard(id) });
    void client.invalidateQueries({ queryKey: qk.images(id) });
    void client.invalidateQueries({ queryKey: qk.moderation });
    void client.invalidateQueries({ queryKey: ['admin-metrics'] });
  };

  const transition = useMutation({
    mutationFn: (args: { to: ReportStatus; duplicateOf?: string }) =>
      transitionHazard({
        hazardId: id,
        to: args.to,
        note,
        duplicateOf: args.duplicateOf ?? null,
        approveImages: args.to === 'verified' ? approveImages : null,
      }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      setNote('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const traffic = useMutation({
    mutationFn: (level: number | null) => setTrafficExposure(id, level),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const imagePrivacy = useMutation({
    mutationFn: ({ imageId, approved }: { imageId: string; approved: boolean }) => setImagePrivacy(imageId, approved),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const assign = useMutation({
    mutationFn: (officerId: string) => assignHazard(id, officerId),
    onSuccess: (r) => {
      setOfficerPicker(false);
      refresh();
      router.push(`/officer/task/${r.task_id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (hazard.isLoading) {
    return (
      <Screen back title={t('admin.moderation')}>
        <SkeletonCard lines={5} />
      </Screen>
    );
  }
  if (!h) {
    return (
      <Screen back title={t('admin.moderation')}>
        <EmptyState title={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const reportImgs = (images.data ?? []).filter((i) => i.kind === 'report' || i.kind === 'additional');
  const first = reportImgs[0];
  const s = h.status;
  const busy = transition.isPending;

  return (
    <Screen back title={h.public_code} subtitle={t(`categories.${h.category}`)} refreshing={hazard.isRefetching} onRefresh={refresh} keyboard>
      <Card>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <StatusBadge status={h.status} />
            <SeverityBadge severity={h.severity} />
            <Pill label={h.location_source === 'gps' ? t('report.gpsPin') : t('report.manualPin')} color={p.cyan} />
          </View>
          {h.description ? <Text>{h.description}</Text> : null}
          <Text variant="caption" tone="muted">
            {[h.address, h.city].filter(Boolean).join(' · ')} · {formatDateTime(h.created_at)}
          </Text>
          <Button size="sm" variant="secondary" icon="open-outline" label={t('hazard.title')} onPress={() => router.push(`/hazard/${h.id}`)} />
        </View>
      </Card>

      <Section title={t('hazard.photos')}>
        {first?.url ? (
          <AnnotatedImage uri={first.url} aspect={(first.width ?? 4) / Math.max(1, first.height ?? 3)} detections={ai.data?.detections ?? []} />
        ) : (
          <Text tone="muted">{t('hazard.noPhotos')}</Text>
        )}
        <Text variant="caption" tone="faint">
          {ai.data
            ? `${t('admin.aiSummary', { category: ai.data.top_category ? t(`categories.${ai.data.top_category}`) : '—', confidence: Math.round((ai.data.top_confidence ?? 0) * 100) })} · ${ai.data.model_name} ${ai.data.model_version}`
            : t('admin.noAi')}
        </Text>
        {reportImgs.map((img) => (
          <Card key={img.id} style={{ padding: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {img.url ? <Image source={{ uri: img.url }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Pill label={img.privacy_blurred ? t('admin.imagesBlurred') : t('admin.imagesNotBlurred')} color={img.privacy_blurred ? p.success : p.warning} />
              </View>
              <Chip
                label={img.privacy_approved ? t('common.on') : t('common.off')}
                icon={img.privacy_approved ? 'eye' : 'eye-off'}
                selected={img.privacy_approved}
                onPress={() => imagePrivacy.mutate({ imageId: img.id, approved: !img.privacy_approved })}
              />
            </View>
          </Card>
        ))}
      </Section>

      {(dups.data ?? []).length > 0 ? (
        <Section title={t('report.duplicatesTitle')}>
          {(dups.data ?? []).map((d) => (
            <Card key={d.id} style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" weight="semibold">
                    {d.public_code} · {t(`categories.${d.category}`)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatDistance(d.distance_m)} · {t(`status.${d.status}`)}
                  </Text>
                </View>
                {['submitted', 'under_review', 'verified', 'reopened'].includes(s) ? (
                  <Button size="sm" full={false} variant="secondary" label={t('admin.markDuplicate')} onPress={() => transition.mutate({ to: 'duplicate', duplicateOf: d.id })} />
                ) : null}
              </View>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title={t('admin.trafficExposure')}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((lvl) => (
            <Chip key={lvl} label={String(lvl)} selected={h.traffic_exposure === lvl} onPress={() => traffic.mutate(lvl)} />
          ))}
          <Chip label={t('admin.clear')} selected={h.traffic_exposure == null} onPress={() => traffic.mutate(null)} />
        </View>
      </Section>

      {h.priority ? (
        <Card>
          <PriorityExplainer priority={h.priority} />
        </Card>
      ) : null}

      <Section title={t('admin.moderation')}>
        <Input label={`${t('admin.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} maxLength={500} multiline />
        {['submitted', 'under_review', 'reopened'].includes(s) ? (
          <Card>
            <ToggleRow icon="eye-outline" title={t('admin.approveImages')} value={approveImages} onChange={setApproveImages} />
          </Card>
        ) : null}
        {s === 'submitted' || s === 'reopened' ? (
          <Button variant="secondary" icon="search" label={t('admin.markReview')} loading={busy} onPress={() => transition.mutate({ to: 'under_review' })} />
        ) : null}
        {['submitted', 'under_review', 'reopened'].includes(s) ? (
          <>
            <Button icon="shield-checkmark" label={t('admin.verify')} loading={busy} onPress={() => transition.mutate({ to: 'verified' })} />
            <Button variant="danger" icon="close-circle" label={t('admin.reject')} loading={busy} onPress={() => transition.mutate({ to: 'rejected' })} />
          </>
        ) : null}
        {s === 'verified' || s === 'reopened' ? (
          <Button variant="secondary" icon="people" label={t('officer.assign')} onPress={() => setOfficerPicker(true)} />
        ) : null}
        {['verified', 'assigned', 'in_progress', 'reopened'].includes(s) ? (
          <Button variant="secondary" icon="checkmark-done" label={t('admin.resolve')} loading={busy} onPress={() => transition.mutate({ to: 'resolved' })} />
        ) : null}
        {s === 'rejected' || s === 'duplicate' ? (
          <Button variant="secondary" icon="refresh" label={t('admin.markReview')} loading={busy} onPress={() => transition.mutate({ to: 'under_review' })} />
        ) : null}
        <Notice tone="info" text={t('map.verifiedOnly')} />
      </Section>

      <Modal visible={officerPicker} animationType="slide" transparent onRequestClose={() => setOfficerPicker(false)}>
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
                  onPress={() => assign.mutate(o.id)}
                />
              ))}
            </ScrollView>
            <Button variant="secondary" label={t('common.close')} onPress={() => setOfficerPicker(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
