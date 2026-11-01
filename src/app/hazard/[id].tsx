import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, Share, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { HazardPin } from '@/components/map/HazardMap';
import { PriorityExplainer, StatusTimeline } from '@/components/report/HazardBits';
import { AnnotatedImage } from '@/components/report/AiResultView';
import { CategoryIcon, Pill, SeverityBadge, StatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, Notice, SkeletonCard, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  confirmHazard,
  getAiDetection,
  getHazard,
  getHazardImages,
  getTimeline,
  myConfirmation,
  requestReopen,
} from '@/lib/api/hazards';
import { signedUrls } from '@/lib/api/storage';
import { tasksForHazard } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query';
import { openInMaps } from '@/lib/routing';
import { nativeMapsAvailable } from '@/lib/maps';
import { HAZARD_BUCKET, supabase } from '@/lib/supabase';
import { isStaff, useSession } from '@/stores/session';
import { darkMapStyle, severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function HazardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { p, isDark } = useTheme();
  const client = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  const role = useSession((s) => s.role);
  const [reopenNote, setReopenNote] = useState('');

  const hazard = useQuery({ queryKey: qk.hazard(id), queryFn: () => getHazard(id) });
  const timeline = useQuery({ queryKey: qk.timeline(id), queryFn: () => getTimeline(id) });
  const images = useQuery({
    queryKey: qk.images(id),
    queryFn: async () => {
      const rows = await getHazardImages(id);
      const urls = await signedUrls(HAZARD_BUCKET, rows.map((r) => r.storage_path)).catch(() => ({}) as Record<string, string>);
      return rows.map((r) => ({ ...r, url: urls[r.storage_path] ?? null }));
    },
  });
  const h = hazard.data;
  const ai = useQuery({
    queryKey: ['ai', h?.ai_detection_id],
    enabled: !!h?.ai_detection_id,
    queryFn: () => getAiDetection(h!.ai_detection_id!),
  });
  const confirmation = useQuery({
    queryKey: ['confirmation', id, uid],
    enabled: !!uid && !!h && h.reporter_id !== uid,
    queryFn: () => myConfirmation(id, uid!),
  });
  const tasks = useQuery({ queryKey: ['hazard-tasks', id], enabled: isStaff(role), queryFn: () => tasksForHazard(id) });

  // Live status updates (RLS ensures only visible rows are delivered).
  useEffect(() => {
    const channel = supabase
      .channel(`hazard:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'status_history', filter: `hazard_id=eq.${id}` }, () => {
        void client.invalidateQueries({ queryKey: qk.timeline(id) });
        void client.invalidateQueries({ queryKey: qk.hazard(id) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, client]);

  const confirm = useMutation({
    mutationFn: (still: boolean) => confirmHazard(id, still),
    onSuccess: () => {
      toast.success(t('hazard.thanksConfirm'));
      void client.invalidateQueries({ queryKey: qk.hazard(id) });
      void client.invalidateQueries({ queryKey: ['confirmation', id, uid] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reopen = useMutation({
    mutationFn: () => requestReopen(id, reopenNote.trim()),
    onSuccess: () => {
      toast.success(t('hazard.reopened'));
      setReopenNote('');
      void client.invalidateQueries({ queryKey: qk.hazard(id) });
      void client.invalidateQueries({ queryKey: qk.timeline(id) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const refresh = () => {
    void hazard.refetch();
    void timeline.refetch();
    void images.refetch();
  };

  if (hazard.isLoading) {
    return (
      <Screen back title={t('hazard.title')}>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (!h) {
    return (
      <Screen back title={t('hazard.title')}>
        {hazard.error ? <Notice tone="danger" text={errorMessage(hazard.error)} /> : <EmptyState title={t('errors.NOT_FOUND')} />}
      </Screen>
    );
  }

  const mine = h.reporter_id === uid;
  const active = ['verified', 'assigned', 'in_progress'].includes(h.status);
  const reportImages = (images.data ?? []).filter((i) => i.kind === 'report' || i.kind === 'additional');
  const repairImages = (images.data ?? []).filter((i) => i.kind === 'before' || i.kind === 'after');
  const place = [h.address, h.city].filter(Boolean).join(' · ') || t('common.unknownPlace');
  const firstImage = reportImages[0];
  const openTask = (tasks.data ?? []).find((tk) => ['assigned', 'in_progress', 'completion_requested'].includes(tk.status));

  return (
    <Screen
      back
      title={h.public_code}
      subtitle={t(`categories.${h.category}`)}
      refreshing={hazard.isRefetching}
      onRefresh={refresh}
      right={
        <Button
          size="sm"
          full={false}
          variant="secondary"
          icon="share-outline"
          label={t('hazard.share')}
          onPress={() =>
            void Share.share({
              message: `${t('common.appName')} · ${h.public_code} · ${t(`categories.${h.category}`)} · ${t(`status.${h.status}`)}\nhttps://maps.google.com/?q=${h.latitude},${h.longitude}`,
            })
          }
        />
      }
    >
      <Card>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <CategoryIcon category={h.category} color={severityColor(p, h.severity)} size={52} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="heading">{t(`categories.${h.category}`)}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <StatusBadge status={h.status} />
                <SeverityBadge severity={h.severity} />
                {mine ? <Pill label={t('hazard.reportedBy')} color={p.primary} icon="person" /> : null}
                {h.ai_detection_id ? <Pill label={t('hazard.aiBadge')} color={p.cyan} icon="sparkles" /> : null}
              </View>
            </View>
          </View>
          {h.description ? <Text>{h.description}</Text> : null}
          <Text variant="caption" tone="muted">
            {t('map.reported', { time: timeAgo(h.created_at) })} · {formatDateTime(h.created_at)} · {t('map.confirmations', { count: h.confirmations_count })}
          </Text>
        </View>
      </Card>

      {/* Photos */}
      <Section title={t('hazard.photos')}>
        {images.isLoading ? (
          <SkeletonCard lines={1} />
        ) : reportImages.length === 0 ? (
          <Notice tone="info" icon="eye-off-outline" text={mine ? t('hazard.noPhotos') : t('hazard.photosPending')} />
        ) : ai.data && firstImage?.url ? (
          <AnnotatedImage
            uri={firstImage.url}
            aspect={(firstImage.width ?? 4) / Math.max(1, firstImage.height ?? 3)}
            detections={ai.data.detections ?? []}
          />
        ) : null}
        {reportImages.length > (ai.data ? 1 : 0) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {reportImages.slice(ai.data ? 1 : 0).map((img) =>
              img.url ? (
                <Image key={img.id} source={{ uri: img.url }} style={{ width: 220, height: 160, borderRadius: 18 }} contentFit="cover" transition={200} accessibilityLabel={t('hazard.photos')} />
              ) : null,
            )}
          </ScrollView>
        ) : null}
        {ai.data ? (
          <Text variant="caption" tone="faint">
            {t('report.aiModel', { name: ai.data.model_name, version: ai.data.model_version })}
            {ai.data.top_category ? ` · ${t(`categories.${ai.data.top_category}`)} ${Math.round((ai.data.top_confidence ?? 0) * 100)}%` : ''}
          </Text>
        ) : null}
      </Section>

      {/* Location */}
      <Section title={t('hazard.location')}>
        {nativeMapsAvailable ? (
          <View style={{ height: 180, borderRadius: 22, overflow: 'hidden' }}>
            <MapView
              style={{ flex: 1 }}
              pointerEvents="none"
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
              initialRegion={{ latitude: h.latitude, longitude: h.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              customMapStyle={Platform.OS === 'android' && isDark ? darkMapStyle : undefined}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker coordinate={{ latitude: h.latitude, longitude: h.longitude }} anchor={{ x: 0.5, y: 1 }}>
                <HazardPin hazard={h} selected />
              </Marker>
            </MapView>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="location-outline" size={18} color={p.cyan} />
          <Text variant="caption" style={{ flex: 1 }}>
            {place}
          </Text>
        </View>
        {h.location_accuracy_m ? (
          <Text variant="caption" tone="faint">
            {t('hazard.accuracyNote', { value: Math.round(h.location_accuracy_m) })}
          </Text>
        ) : null}
        <Button variant="secondary" icon="navigate-outline" label={t('hazard.openInMaps')} onPress={() => void openInMaps(h, h.public_code)} />
      </Section>

      {/* Priority */}
      {h.priority ? (
        <Section title={t('priority.title')}>
          <Card>
            <PriorityExplainer priority={h.priority} />
          </Card>
        </Section>
      ) : null}

      {/* Confirm / reopen */}
      {!mine && active ? (
        <Section title={t('hazard.confirmTitle')}>
          {confirmation.data ? (
            <Notice tone="success" text={t('hazard.thanksConfirm')} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} icon="checkmark-circle" label={t('hazard.stillThere')} onPress={() => confirm.mutate(true)} loading={confirm.isPending && confirm.variables === true} />
            <Button style={{ flex: 1 }} variant="secondary" icon="close-circle" label={t('hazard.gone')} onPress={() => confirm.mutate(false)} loading={confirm.isPending && confirm.variables === false} />
          </View>
        </Section>
      ) : null}

      {h.status === 'resolved' && (mine || !!confirmation.data || isStaff(role)) ? (
        <Section title={t('hazard.reopen')}>
          <Input label={t('hazard.reopenNote')} value={reopenNote} onChangeText={setReopenNote} maxLength={500} multiline />
          <Button variant="warning" icon="refresh" label={t('hazard.reopen')} onPress={() => reopen.mutate()} loading={reopen.isPending} />
        </Section>
      ) : null}

      {/* Repair photos */}
      {repairImages.length > 0 ? (
        <Section title={`${t('officer.before')} / ${t('officer.after')}`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {repairImages.map((img) =>
              img.url ? (
                <View key={img.id} style={{ gap: 4 }}>
                  <Image source={{ uri: img.url }} style={{ width: 180, height: 130, borderRadius: 16 }} contentFit="cover" />
                  <Text variant="label" tone="muted">
                    {img.kind === 'before' ? t('officer.before') : t('officer.after')}
                  </Text>
                </View>
              ) : null,
            )}
          </ScrollView>
        </Section>
      ) : null}

      {/* Staff shortcuts */}
      {isStaff(role) ? (
        <View style={{ gap: 10 }}>
          {openTask ? (
            <Button icon="construct" label={t('officer.title')} onPress={() => router.push(`/officer/task/${openTask.id}`)} />
          ) : null}
          {role === 'admin' ? (
            <Button variant="secondary" icon="shield-checkmark" label={t('admin.moderation')} onPress={() => router.push(`/admin/hazard/${h.id}`)} />
          ) : null}
        </View>
      ) : null}

      {/* Timeline */}
      <Section title={t('hazard.timeline')}>
        <Card>{timeline.isLoading ? <SkeletonCard lines={3} /> : <StatusTimeline events={timeline.data ?? []} current={h.status} />}</Card>
      </Section>
    </Screen>
  );
}
