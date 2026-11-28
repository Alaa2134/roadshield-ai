import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Chip } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { DEFECT_CLASSES, searchRoads, type DefectClass, type RoadHit } from '@/lib/api/field';
import { errorMessage } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { getCurrentPosition, requestLocationPermission } from '@/lib/location';
import { enqueue } from '@/lib/offline/fieldOutbox';
import { useFieldOrg } from '@/stores/field';
import { useTheme } from '@/theme/ThemeProvider';

type Defect = { defect_class: DefectClass; severity: 'low' | 'medium' | 'high' | 'critical'; length_m: string; width_m: string; depth_mm: string };
const CONDITIONS = ['good', 'fair', 'poor', 'critical'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
// Only measured values are sent; empty fields stay unknown. Decimal comma is accepted.
const measure = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export default function Inspect() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const org = useFieldOrg((s) => s.org);
  const [q, setQ] = useState('');
  const [road, setRoad] = useState<RoadHit | null>(null);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number] | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const hits = useQuery({ queryKey: ['road-search', org?.org_id, q], queryFn: () => searchRoads(org!.org_id, q), enabled: !!org && q.trim().length >= 2 && !road });

  const setDefect = (i: number, patch: Partial<Defect>) => setDefects(defects.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const locate = async () => {
    if (!(await requestLocationPermission())) return;
    const pos = await getCurrentPosition({ precise: true, maxAgeMs: 15_000 });
    if (pos) setGps({ latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy });
  };
  const invalid = defects.some((d) => [d.length_m, d.width_m, d.depth_mm].some((v) => v.trim() !== '' && !(Number(v.replace(',', '.')) >= 0)));

  const submit = async () => {
    if (!org || !road || !condition || invalid) { toast.error(t('field.required')); return; }
    setBusy(true);
    try {
      await enqueue('inspection', `${road.name ?? road.highway_class} · ${t(`field.conditions.${condition}`)}`, {
        org_id: org.org_id, road_id: road.id, condition, notes, inspected_at: new Date().toISOString(),
        latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null,
        defects: defects.map((d) => ({ defect_class: d.defect_class, severity: d.severity, length_m: measure(d.length_m), width_m: measure(d.width_m), depth_mm: measure(d.depth_mm),
          latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null })),
      });
      haptic.success();
      toast.success(t('field.queuedOffline'));
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('field.newInspection')} back keyboard footer={<Button label={t('field.submitInspection')} icon="send" onPress={submit} loading={busy} disabled={!road || !condition || invalid} testID="inspection-submit" />}>
      <Notice tone="info" text={t('field.measuredNote')} />
      <Section title={t('field.road')}>
        {road ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="git-commit-outline" size={22} color={p.cyan} />
              <View style={{ flex: 1 }}>
                <Text weight="semibold">{road.name ?? road.highway_class}</Text>
                <Text variant="caption" tone="muted">{road.highway_class} · {(road.length_m / 1000).toFixed(2)} km</Text>
              </View>
              <Button size="sm" full={false} variant="ghost" label={t('common.edit')} onPress={() => setRoad(null)} />
            </View>
          </Card>
        ) : (
          <>
            <Input icon="search" placeholder={t('field.searchRoad')} value={q} onChangeText={setQ} />
            {(hits.data ?? []).map((r) => (
              <Pressable key={r.id} accessibilityRole="button" onPress={() => { setRoad(r); haptic.tap(); }}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border }}>
                <Text weight="medium">{r.name ?? r.highway_class}</Text>
                <Text variant="caption" tone="muted">{r.highway_class} · {(r.length_m / 1000).toFixed(2)} km</Text>
              </Pressable>
            ))}
          </>
        )}
      </Section>
      <Section title={t('field.condition')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CONDITIONS.map((c) => <Chip key={c} label={t(`field.conditions.${c}`)} selected={condition === c} onPress={() => setCondition(c)} />)}
        </View>
      </Section>
      <Section title={t('field.defects')} action={<Button size="sm" full={false} variant="secondary" icon="add" label={t('field.addDefect')}
        onPress={() => setDefects([...defects, { defect_class: 'D40_pothole', severity: 'medium', length_m: '', width_m: '', depth_mm: '' }])} />}>
        {defects.map((d, i) => (
          <Card key={i}>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="label" tone="muted">{t('field.defectClass')}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={() => setDefects(defects.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={18} color={p.danger} /></Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {DEFECT_CLASSES.map((c) => <Chip key={c} label={t(`field.classes.${c}`)} selected={d.defect_class === c} onPress={() => setDefect(i, { defect_class: c })} />)}
              </View>
              <Text variant="label" tone="muted">{t('field.severity')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {SEVERITIES.map((s) => <Chip key={s} label={t(`severity.${s}`)} selected={d.severity === s} onPress={() => setDefect(i, { severity: s })} />)}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Input label={t('field.lengthM')} keyboardType="decimal-pad" value={d.length_m} onChangeText={(v) => setDefect(i, { length_m: v })} /></View>
                <View style={{ flex: 1 }}><Input label={t('field.widthM')} keyboardType="decimal-pad" value={d.width_m} onChangeText={(v) => setDefect(i, { width_m: v })} /></View>
                <View style={{ flex: 1 }}><Input label={t('field.depthMm')} keyboardType="decimal-pad" value={d.depth_mm} onChangeText={(v) => setDefect(i, { depth_mm: v })} /></View>
              </View>
              <Text variant="caption" tone="faint">{t('field.areaHint')}</Text>
            </View>
          </Card>
        ))}
      </Section>
      <Input label={t('field.notes')} multiline value={notes} onChangeText={setNotes} maxLength={4000} />
      <Section title={t('field.location')}>
        <Button variant="secondary" icon="locate" label={gps ? t('field.gpsSet', { acc: Math.round(gps.accuracy ?? 0) }) : t('field.useGps')} onPress={() => void locate()} />
      </Section>
    </Screen>
  );
}
