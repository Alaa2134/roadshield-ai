import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Chip } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice, SkeletonCard, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { transitionWorkOrder, workOrder } from '@/lib/api/field';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { persistDraftImage, prepareImage } from '@/lib/images';
import { enqueue } from '@/lib/offline/fieldOutbox';
import { useFieldOrg } from '@/stores/field';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORIES = ['asphalt', 'milling', 'excavation', 'filling', 'aggregate', 'transportation', 'labor', 'equipment', 'traffic_control', 'engineering_inspection', 'testing', 'taxes', 'other'] as const;
const today = () => new Date().toISOString().slice(0, 10);
const decimal = (v: string) => /^\d{1,12}([.,]\d{1,4})?$/.test(v.trim());

export default function FieldWorkOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { p } = useTheme();
  const client = useQueryClient();
  const org = useFieldOrg((s) => s.org);
  const uid = useSession((s) => s.session?.user.id);
  const q = useQuery({ queryKey: ['field-wo', id], queryFn: () => workOrder(String(id)) });
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [cost, setCost] = useState({ category: 'asphalt' as (typeof CATEGORIES)[number], description: '', quantity: '', unit: 'm2', unit_rate: '' });

  const move = useMutation({
    mutationFn: (to: string) => transitionWorkOrder(String(id), to),
    onSuccess: () => { haptic.success(); void client.invalidateQueries({ queryKey: ['field-wo', id] }); void client.invalidateQueries({ queryKey: ['field-wos'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    // Re-encode (strips EXIF/GPS) and keep a durable copy so the queued log survives restarts.
    const prepared = await prepareImage(a.uri, a.width, a.height);
    const kept = await persistDraftImage(`field-${id}`, prepared, `${Date.now()}.jpg`);
    setPhotos([...photos, kept.uri]);
  };

  const saveLog = async () => {
    if (!org || !note.trim()) { toast.error(t('field.required')); return; }
    const pct = progress.trim() ? Math.max(0, Math.min(100, Number(progress))) : null;
    await enqueue('work_log', `${q.data?.wo.code ?? ''} · ${note.slice(0, 40)}`, { org_id: org.org_id, work_order_id: id, log_date: today(), note: note.trim(), progress_pct: pct, photos });
    setNote(''); setProgress(''); setPhotos([]);
    toast.success(t('field.queuedOffline'));
  };

  const saveCost = async () => {
    const wo = q.data?.wo;
    if (!org || !wo || !cost.description.trim() || !decimal(cost.quantity) || !decimal(cost.unit_rate) || !cost.unit.trim()) { toast.error(t('field.required')); return; }
    await enqueue('cost_item', `${wo.code} · ${cost.description.slice(0, 40)}`, {
      org_id: org.org_id, project_id: wo.project_id, work_order_id: wo.id, category: cost.category, description: cost.description.trim(), unit: cost.unit.trim(),
      // Decimals travel as strings; Postgres numeric does the arithmetic.
      quantity: cost.quantity.replace(',', '.'), unit_rate: cost.unit_rate.replace(',', '.'), cost_date: today(),
      source_kind: org.role === 'contractor' ? 'contractor_submission' : 'engineer_measurement',
    });
    setCost({ ...cost, description: '', quantity: '', unit_rate: '' });
    toast.success(t('field.queuedOffline'));
  };

  if (q.isLoading) return <Screen back title="…"><SkeletonCard /><SkeletonCard /></Screen>;
  if (!q.data) return <Screen back title={t('field.workOrders')}><Notice tone="danger" text={q.error ? errorMessage(q.error) : t('errors.generic')} /></Screen>;
  const { wo, logs } = q.data;
  const isContractor = org?.role === 'contractor';
  const staff = org?.role === 'owner' || org?.role === 'road_engineer' || (org?.role === 'field_inspector' && wo.assigned_engineer === uid);
  const canWork = ['issued', 'in_progress', 'rejected', 'submitted'].includes(wo.status) && (isContractor || staff);

  return (
    <Screen back title={wo.title} subtitle={`${wo.code} · ${t(`field.statuses.${wo.status}`)}`} keyboard
      refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Card>
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">{t('field.progress')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: p.surface2, overflow: 'hidden' }}>
              <View style={{ width: `${wo.progress_pct}%`, height: '100%', backgroundColor: p.cyan }} />
            </View>
            <Text weight="semibold">{wo.progress_pct}%</Text>
          </View>
          {wo.due_date ? <Text variant="caption" tone="muted">{t('field.due', { date: formatDate(wo.due_date) })}</Text> : null}
          {wo.description ? <Text tone="muted">{wo.description}</Text> : null}
        </View>
      </Card>
      {['issued', 'rejected'].includes(wo.status) && (isContractor || staff) ? <Button icon="play" label={t('field.start')} onPress={() => move.mutate('in_progress')} loading={move.isPending} /> : null}
      {wo.status === 'in_progress' && (isContractor || staff) ? <Button icon="checkmark-done" variant="secondary" label={t('field.submitWork')} onPress={() => move.mutate('submitted')} loading={move.isPending} /> : null}

      {canWork ? (
        <Section title={t('field.addLog')}>
          <Input label={t('field.logNote')} multiline value={note} onChangeText={setNote} maxLength={4000} />
          <Input label={`${t('field.progress')} %`} keyboardType="number-pad" value={progress} onChangeText={setProgress} maxLength={3} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button size="sm" full={false} variant="secondary" icon="camera" label={t('field.photo')} onPress={() => void addPhoto()} />
            {photos.length ? <Text variant="caption" tone="muted">{t('field.photos', { count: photos.length })}</Text> : null}
          </View>
          <Button icon="save-outline" label={t('common.save')} onPress={() => void saveLog()} />
        </Section>
      ) : null}

      {canWork ? (
        <Section title={t('field.recordCost')}>
          <Notice tone="info" text={t('field.costNote')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CATEGORIES.map((c) => <Chip key={c} label={t(`field.categories.${c}`)} selected={cost.category === c} onPress={() => setCost({ ...cost, category: c })} />)}
          </ScrollView>
          <Input label={t('field.description')} value={cost.description} onChangeText={(v) => setCost({ ...cost, description: v })} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Input label={t('field.quantity')} keyboardType="decimal-pad" value={cost.quantity} onChangeText={(v) => setCost({ ...cost, quantity: v })} /></View>
            <View style={{ flex: 1 }}><Input label={t('field.unit')} value={cost.unit} onChangeText={(v) => setCost({ ...cost, unit: v })} /></View>
          </View>
          <Input label={`${t('field.unitRate')} (${org?.default_currency ?? ''})`} keyboardType="decimal-pad" value={cost.unit_rate} onChangeText={(v) => setCost({ ...cost, unit_rate: v })} />
          <Button variant="secondary" icon="receipt-outline" label={t('common.save')} onPress={() => void saveCost()} />
        </Section>
      ) : null}

      <Section title={t('field.progress')}>
        {logs.map((l) => (
          <Card key={l.id}>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" tone="muted">{formatDate(l.log_date)}</Text>
                {l.progress_pct !== null ? <Text variant="caption" weight="semibold">{l.progress_pct}%</Text> : null}
              </View>
              <Text>{l.note}</Text>
              {l.photo_paths.length ? <Text variant="caption" tone="faint"><Ionicons name="image-outline" size={12} /> {t('field.photos', { count: l.photo_paths.length })}</Text> : null}
            </View>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
