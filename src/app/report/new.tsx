import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnnotatedImage, ConfidenceMeter } from '@/components/report/AiResultView';
import { CategoryIcon, Pill, StatusBadge, categoryIcon } from '@/components/ui/Badges';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { analyzeImage, LOW_CONFIDENCE } from '@/lib/ai';
import { nativeMapsAvailable } from '@/lib/maps';
import { findDuplicates, type DuplicateCandidate } from '@/lib/api/hazards';
import { DEMO_REGION } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDistance, timeAgo } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { persistDraftImage, prepareImage, writeBase64Image } from '@/lib/images';
import { getCurrentPosition, requestLocationPermission, reverseGeocode, useLocationStore } from '@/lib/location';
import { emptyDraftData, getDraft, newDraftId, saveDraft, type DraftData } from '@/lib/offline/drafts';
import { submitNow, useUploadProgress } from '@/lib/offline/sync';
import { qk } from '@/lib/query';
import { AI_CATEGORIES, HAZARD_CATEGORIES, SEVERITIES, type HazardCategory } from '@/lib/types';
import { reportSchema } from '@/lib/validation';
import { useNetwork } from '@/stores/network';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { darkMapStyle, severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Step = 'photo' | 'ai' | 'details' | 'location' | 'review';
const STEPS: Step[] = ['photo', 'ai', 'details', 'location', 'review'];
const STEP_LABEL: Record<Step, string> = {
  photo: 'report.stepPhoto',
  ai: 'report.stepAnalysis',
  details: 'report.stepDetails',
  location: 'report.stepLocation',
  review: 'report.stepReview',
};
const MAX_PHOTOS = 6;
const DRIVING_ACK_MS = 30 * 60_000;

export default function NewReport() {
  const { t } = useTranslation();
  const { p, isDark, isRTL } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ draft?: string }>();
  const uid = useSession((s) => s.session?.user.id);
  const online = useNetwork((s) => s.online);
  const ackAt = useSettings((s) => s.drivingAcknowledgedAt);
  const acknowledge = useSettings((s) => s.acknowledgeDriving);
  const progress = useUploadProgress((s) => s.progress);

  const [draftId] = useState(() => params.draft ?? newDraftId());
  const [data, setData] = useState<DraftData>(emptyDraftData);
  const [step, setStep] = useState<Step>('photo');
  const [loaded, setLoaded] = useState(!params.draft);
  const [safeConfirmed, setSafeConfirmed] = useState(() => !!ackAt && Date.now() - ackAt < DRIVING_ACK_MS);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback((patch: Partial<DraftData>) => setData((d) => ({ ...d, ...patch })), []);

  // Resume an existing draft.
  useEffect(() => {
    if (!params.draft) return;
    void getDraft(params.draft).then((d) => {
      if (d) {
        setData(d.data);
        setStep(d.data.photos.length === 0 ? 'photo' : d.data.category ? (d.data.latitude != null ? 'review' : 'location') : 'details');
      }
      setLoaded(true);
    });
  }, [params.draft]);

  // Autosave the draft locally whenever it changes (nothing is lost if the app closes).
  useEffect(() => {
    if (!loaded || !uid || data.photos.length === 0) return;
    void saveDraft(draftId, uid, data, 'draft');
  }, [data, draftId, uid, loaded]);

  const stepIndex = STEPS.indexOf(step);
  const go = (s: Step) => {
    haptic.tap();
    setError(null);
    setStep(s);
  };
  const back = () => {
    if (stepIndex === 0) router.back();
    else go(STEPS[stepIndex - 1]!);
  };

  /* --------------------------------------------------------------- photos */
  const addPhotos = async (assets: { uri: string; width?: number; height?: number }[]) => {
    setBusy(true);
    try {
      const added: DraftData['photos'] = [];
      for (const a of assets.slice(0, MAX_PHOTOS - data.photos.length)) {
        const prepared = await prepareImage(a.uri, a.width, a.height);
        const stored = await persistDraftImage(draftId, prepared, `photo-${Date.now()}-${added.length}`);
        added.push(stored);
      }
      const isFirst = data.photos.length === 0;
      setData((d) => ({ ...d, photos: [...d.photos, ...added] }));
      haptic.success();
      if (isFirst && added[0]) void runAi(added[0].uri);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      exif: false,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - data.photos.length,
    });
    if (!res.canceled) await addPhotos(res.assets);
  };

  /* --------------------------------------------------------------- AI */
  const runAi = async (uri: string) => {
    setAnalyzing(true);
    setStep('ai');
    const outcome = await analyzeImage(uri);
    if (outcome.kind === 'ok') {
      const a = outcome.analysis;
      let photos = null as DraftData['photos'] | null;
      if (a.redactedImageBase64 && a.privacy.applied) {
        // Replace the first photo with the privacy-redacted version from the server.
        const redacted = await writeBase64Image(draftId, `photo-redacted-${Date.now()}`, a.redactedImageBase64, a.imageWidth, a.imageHeight).catch(() => null);
        if (redacted) photos = [{ ...redacted, privacyBlurred: true }];
      }
      setData((d) => ({
        ...d,
        photos: photos ? [...photos, ...d.photos.slice(1)] : d.photos,
        ai: {
          state: 'ok',
          payload: a.payload,
          signature: a.signature,
          modelName: a.modelName,
          modelVersion: a.modelVersion,
          topCategory: a.topCategory,
          topConfidence: a.topConfidence,
          detections: a.detections,
          imageWidth: a.imageWidth,
          imageHeight: a.imageHeight,
          privacy: a.privacy,
        },
      }));
    } else {
      setData((d) => ({ ...d, ai: { state: outcome.kind } }));
    }
    setAnalyzing(false);
  };

  /* --------------------------------------------------------------- location */
  const locateWithGps = async () => {
    const granted = useLocationStore.getState().permission === 'granted' || (await requestLocationPermission());
    if (!granted) {
      setError(t('errors.locationDenied'));
      return null;
    }
    const pos = await getCurrentPosition({ precise: true, maxAgeMs: 15_000 }).catch(() => null);
    if (!pos) return null;
    update({ latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy, locationSource: 'gps' });
    void reverseGeocode(pos).then(({ address, city }) => update({ address, city }));
    return pos;
  };

  const toReview = async () => {
    if (data.latitude == null || data.longitude == null) return setError(t('report.needLocation'));
    if (online) {
      try {
        const dups = await findDuplicates(data.latitude, data.longitude, data.category, 50);
        if (dups.length > 0) {
          setDuplicates(dups);
          return;
        }
      } catch {
        // duplicate check is advisory only
      }
    }
    go('review');
  };

  /* --------------------------------------------------------------- submit */
  const submit = async () => {
    if (!uid) return;
    const check = reportSchema.safeParse({ ...data, latitude: data.latitude ?? NaN, longitude: data.longitude ?? NaN });
    if (!check.success) {
      setError(t('errors.VALIDATION_ERROR'));
      return;
    }
    setSubmitting(true);
    setError(null);
    await saveDraft(draftId, uid, data, 'queued');
    if (!online) {
      setSubmitting(false);
      haptic.success();
      router.replace({ pathname: '/report/success', params: { queued: '1' } });
      return;
    }
    const res = await submitNow(draftId);
    setSubmitting(false);
    if (res.ok) {
      haptic.success();
      void client.invalidateQueries({ queryKey: qk.stats });
      void client.invalidateQueries({ queryKey: qk.activity });
      void client.invalidateQueries({ queryKey: qk.myReports(uid) });
      router.replace({ pathname: '/report/success', params: { id: res.result.id, code: res.result.public_code } });
    } else if (res.queued) {
      haptic.warning();
      router.replace({ pathname: '/report/success', params: { queued: '1' } });
    } else {
      haptic.error();
      setError(t(`errors.${res.code}`, { defaultValue: t('errors.generic') }));
    }
  };

  const saveAndExit = async () => {
    if (uid && data.photos.length) {
      await saveDraft(draftId, uid, data, 'draft');
      toast.success(t('report.draftSaved'));
    }
    router.back();
  };

  /* --------------------------------------------------------------- render */
  if (!safeConfirmed) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, padding: 24, justifyContent: 'center', gap: 20, paddingTop: insets.top }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: p.warning + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="car-sport" size={48} color={p.warning} />
          </View>
          <Text variant="title" center accessibilityRole="header">
            {t('report.drivingWarning')}
          </Text>
          <Text tone="muted" center>
            {t('home.tip1')}
          </Text>
        </View>
        <Button
          size="lg"
          label={t('report.imSafe')}
          icon="checkmark-circle"
          onPress={() => {
            acknowledge();
            setSafeConfirmed(true);
          }}
        />
        <Button variant="ghost" label={t('common.cancel')} onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Header with progress */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconButton icon={stepIndex === 0 ? 'close' : isRTL ? 'chevron-forward' : 'chevron-back'} label={t('common.back')} onPress={back} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" accessibilityRole="header">
              {t('report.title')}
            </Text>
            <Text variant="caption" tone="muted">
              {t('onboarding.progress', { current: stepIndex + 1, total: STEPS.length })} · {t(STEP_LABEL[step])}
            </Text>
          </View>
          {data.photos.length > 0 ? (
            <Pressable onPress={saveAndExit} hitSlop={8} accessibilityRole="button">
              <Text variant="caption" tone="primary" weight="semibold">
                {t('report.saveDraft')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityElementsHidden>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= stepIndex ? p.cyan : p.surface2 }} />
          ))}
        </View>
      </View>

      <Animated.View key={step} entering={FadeInRight.duration(260)} exiting={FadeOutLeft.duration(160)} style={{ flex: 1 }}>
        {step === 'photo' ? (
          <PhotoStep data={data} busy={busy} onCapture={addPhotos} onLibrary={pickFromLibrary} onRemove={(i) => update({ photos: data.photos.filter((_, j) => j !== i) })} onNext={() => (data.ai ? go('details') : data.photos[0] ? void runAi(data.photos[0].uri) : undefined)} />
        ) : null}

        {step === 'ai' ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
            {data.photos[0] ? (
              <AnnotatedImage
                uri={data.photos[0].uri}
                aspect={data.photos[0].width / Math.max(1, data.photos[0].height)}
                detections={data.ai?.state === 'ok' ? (data.ai.detections ?? []) : []}
              />
            ) : null}
            {analyzing ? (
              <Card>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <ActivityIndicator color={p.cyan} />
                  <Text>{t('report.analyzing')}</Text>
                </View>
              </Card>
            ) : (
              <AiOutcomeCard
                data={data}
                onUse={(c) => {
                  update({ category: c });
                  go('details');
                }}
                onManual={() => go('details')}
              />
            )}
          </ScrollView>
        ) : null}

        {step === 'details' ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 120 }}>
            <Text variant="subheading">{t('report.pickCategory')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {HAZARD_CATEGORIES.map((c) => {
                const active = data.category === c;
                const suggested = data.ai?.state === 'ok' && data.ai.topCategory === c;
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => {
                      haptic.tap();
                      update({ category: c });
                    }}
                    style={{
                      width: '48%',
                      flexGrow: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      padding: 12,
                      borderRadius: 18,
                      borderWidth: 1.5,
                      borderColor: active ? p.primary : p.border,
                      backgroundColor: active ? p.primary + '1A' : p.surface,
                    }}
                  >
                    <Ionicons name={categoryIcon[c]} size={20} color={active ? p.primary : p.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text variant="caption" weight="semibold" numberOfLines={2}>
                        {t(`categories.${c}`)}
                      </Text>
                      {suggested ? (
                        <Text variant="label" tone="cyan">
                          {t('report.aiResult')}
                        </Text>
                      ) : !AI_CATEGORIES.includes(c) ? (
                        <Text variant="label" tone="faint">
                          {t('report.manualOnly')}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text variant="subheading">{t('report.pickSeverity')}</Text>
            <Text variant="caption" tone="muted">
              {t('report.severityHelp')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SEVERITIES.map((s) => {
                const active = data.severity === s;
                const c = severityColor(p, s);
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => {
                      haptic.tap();
                      update({ severity: s });
                    }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: active ? c : p.border,
                      backgroundColor: active ? c + '26' : p.surface,
                      gap: 6,
                    }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c }} />
                    <Text variant="caption" weight="semibold">
                      {t(`severity.${s}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={`${t('report.description')} (${t('common.optional')})`}
              placeholder={t('report.descriptionPh')}
              multiline
              maxLength={1000}
              value={data.description}
              onChangeText={(v) => update({ description: v })}
              hint={`${data.description.length}/1000`}
            />
            {error ? <Notice tone="danger" text={error} /> : null}
            <Button
              size="lg"
              label={t('common.next')}
              onPress={() => {
                if (!data.category) return setError(t('report.pickCategory'));
                if (!data.severity) return setError(t('report.pickSeverity'));
                if (data.latitude == null) void locateWithGps();
                go('location');
              }}
            />
          </ScrollView>
        ) : null}

        {step === 'location' ? (
          <LocationStep
            data={data}
            onGps={locateWithGps}
            onPin={(r) => {
              update({ latitude: r.latitude, longitude: r.longitude, locationSource: 'manual', accuracy: null });
            }}
            onSettled={(lat, lng) => void reverseGeocode({ latitude: lat, longitude: lng }).then(({ address, city }) => update({ address, city }))}
            error={error}
            duplicates={duplicates}
            onDismissDuplicates={() => {
              setDuplicates(null);
              go('review');
            }}
            onNext={toReview}
          />
        ) : null}

        {step === 'review' ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
            <Text variant="title">{t('report.review')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {data.photos.map((ph) => (
                <Image key={ph.uri} source={{ uri: ph.uri }} style={{ width: 120, height: 120, borderRadius: 16 }} contentFit="cover" />
              ))}
            </ScrollView>
            <Card>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {data.category ? <CategoryIcon category={data.category} color={data.severity ? severityColor(p, data.severity) : p.primary} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">{data.category ? t(`categories.${data.category}`) : '—'}</Text>
                    <Text variant="caption" tone="muted">
                      {t('severity.label')}: {data.severity ? t(`severity.${data.severity}`) : '—'}
                    </Text>
                  </View>
                  <Pressable onPress={() => go('details')} hitSlop={8}>
                    <Text variant="caption" tone="primary" weight="semibold">
                      {t('common.edit')}
                    </Text>
                  </Pressable>
                </View>
                {data.description ? <Text variant="caption">{data.description}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Ionicons name="location" size={16} color={p.cyan} />
                  <Text variant="caption" style={{ flex: 1 }} numberOfLines={2}>
                    {[data.address, data.city].filter(Boolean).join(' · ') ||
                      `${data.latitude?.toFixed(5)}, ${data.longitude?.toFixed(5)}`}
                  </Text>
                  <Pill label={data.locationSource === 'gps' ? t('report.gpsPin') : t('report.manualPin')} color={p.cyan} />
                </View>
                {data.ai?.state === 'ok' && data.ai.topCategory ? (
                  <Pill
                    icon="sparkles"
                    label={`${t('report.aiResult')}: ${t(`categories.${data.ai.topCategory}`)} · ${Math.round((data.ai.topConfidence ?? 0) * 100)}%`}
                    color={p.primary}
                  />
                ) : null}
              </View>
            </Card>
            {!online ? <Notice tone="warning" icon="cloud-offline-outline" text={t('report.queuedOffline')} /> : null}
            {progress && progress.draftId === draftId ? (
              <Notice tone="info" icon="cloud-upload-outline" text={`${t('report.uploading', { current: progress.current, total: progress.total })} ${Math.round(progress.fraction * 100)}%`} />
            ) : null}
            {error ? <Notice tone="danger" text={error} /> : null}
            <Button size="lg" icon="send" label={submitting ? t('report.submitting') : t('report.submit')} onPress={submit} loading={submitting} />
            <Button variant="secondary" label={t('report.saveDraft')} onPress={saveAndExit} disabled={submitting} />
          </ScrollView>
        ) : null}
      </Animated.View>
    </View>
  );
}

/* ================================================================= sub-steps */

function PhotoStep({
  data,
  busy,
  onCapture,
  onLibrary,
  onRemove,
  onNext,
}: {
  data: DraftData;
  busy: boolean;
  onCapture: (a: { uri: string; width?: number; height?: number }[]) => Promise<void>;
  onLibrary: () => Promise<void>;
  onRemove: (i: number) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const full = data.photos.length >= MAX_PHOTOS;

  const capture = async () => {
    if (!camera.current || busy) return;
    haptic.medium();
    const pic = await camera.current.takePictureAsync({ quality: 0.85, exif: false });
    if (pic) await onCapture([{ uri: pic.uri, width: pic.width, height: pic.height }]);
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 14, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flex: 1, borderRadius: 26, overflow: 'hidden', backgroundColor: '#000' }}>
        {permission?.granted && !full ? (
          <CameraView ref={camera} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
            <Ionicons name={full ? 'images' : 'camera-outline'} size={46} color="#9DB0D0" />
            {!full ? (
              <>
                <Text center style={{ color: '#EAF1FF' }}>
                  {permission && !permission.canAskAgain ? t('errors.cameraDenied') : t('report.photoTip')}
                </Text>
                {permission?.canAskAgain !== false ? (
                  <Button full={false} label={t('report.takePhoto')} icon="camera" onPress={() => void requestPermission()} />
                ) : null}
              </>
            ) : null}
          </View>
        )}
        {permission?.granted && !full ? (
          <View style={{ position: 'absolute', bottom: 18, left: 0, right: 0, alignItems: 'center' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('report.takePhoto')}
              disabled={!ready || busy}
              onPress={capture}
              style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' }} />}
            </Pressable>
          </View>
        ) : null}
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
          <View style={{ backgroundColor: 'rgba(7,15,30,0.6)', borderRadius: 14, padding: 10 }}>
            <Text variant="caption" style={{ color: '#EAF1FF' }}>
              {t('report.photoTip')}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="muted">
          {t('report.photos', { count: data.photos.length })}
        </Text>
        <Pressable accessibilityRole="button" onPress={onLibrary} disabled={full || busy} hitSlop={8} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', opacity: full ? 0.4 : 1 }}>
          <Ionicons name="images-outline" size={18} color={p.primary} />
          <Text variant="caption" tone="primary" weight="semibold">
            {t('report.chooseLibrary')}
          </Text>
        </Pressable>
      </View>

      {data.photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ flexGrow: 0 }}>
          {data.photos.map((ph, i) => (
            <Animated.View key={ph.uri} entering={FadeIn}>
              <Image source={{ uri: ph.uri }} style={{ width: 74, height: 74, borderRadius: 14 }} contentFit="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('report.removePhoto')}
                onPress={() => onRemove(i)}
                style={{ position: 'absolute', top: -6, end: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: p.danger, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      ) : null}

      <Button label={t('common.next')} onPress={onNext} disabled={data.photos.length === 0 || busy} />
    </View>
  );
}

function AiOutcomeCard({ data, onUse, onManual }: { data: DraftData; onUse: (c: HazardCategory) => void; onManual: () => void }) {
  const { t } = useTranslation();
  const { p } = useTheme();
  const ai = data.ai;
  if (!ai || ai.state !== 'ok') {
    const text =
      ai?.state === 'not_configured' ? t('report.aiNotConfigured') : ai?.state === 'failed' ? t('report.aiFailed') : t('report.aiUnavailable');
    return (
      <Animated.View entering={FadeInDown} style={{ gap: 14 }}>
        <Notice tone="warning" icon="sparkles-outline" text={text} />
        <Text variant="caption" tone="muted">
          {t('report.aiTrainedOn')}
        </Text>
        <Button label={t('report.chooseManually')} onPress={onManual} />
      </Animated.View>
    );
  }
  const top = ai.topCategory;
  const conf = ai.topConfidence ?? 0;
  return (
    <Animated.View entering={FadeInDown} style={{ gap: 14 }}>
      <Card>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={18} color={p.cyan} />
            <Text variant="subheading">{t('report.aiResult')}</Text>
          </View>
          {top ? (
            <>
              <Text variant="title">{t(`categories.${top}`)}</Text>
              <ConfidenceMeter value={conf} />
              {conf < LOW_CONFIDENCE ? <Notice tone="warning" text={t('report.aiLowConfidence')} /> : null}
            </>
          ) : (
            <Notice tone="info" text={t('report.aiNoDamage')} />
          )}
          <Text variant="caption" tone="faint">
            {t('report.aiModel', { name: ai.modelName, version: ai.modelVersion })} · {t('report.aiDetections', { count: ai.detections?.length ?? 0 })}
            {ai.privacy?.applied ? ` · ${t('report.aiPrivacy', { count: (ai.privacy.faces ?? 0) + (ai.privacy.plates ?? 0) })}` : ''}
          </Text>
          <Text variant="caption" tone="muted">
            {t('report.aiTrainedOn')}
          </Text>
        </View>
      </Card>
      {top ? <Button label={t('report.useSuggestion')} icon="checkmark" onPress={() => onUse(top)} /> : null}
      <Button variant="secondary" label={t('report.chooseManually')} onPress={onManual} />
    </Animated.View>
  );
}

function LocationStep({
  data,
  onGps,
  onPin,
  onSettled,
  error,
  duplicates,
  onDismissDuplicates,
  onNext,
}: {
  data: DraftData;
  onGps: () => Promise<{ latitude: number; longitude: number } | null>;
  onPin: (r: Region) => void;
  onSettled: (lat: number, lng: number) => void;
  error: string | null;
  duplicates: DuplicateCandidate[] | null;
  onDismissDuplicates: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { p, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const programmatic = useRef(false);
  const initial: Region =
    data.latitude != null && data.longitude != null
      ? { latitude: data.latitude, longitude: data.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 }
      : { ...DEMO_REGION };

  useEffect(() => {
    if (data.latitude != null && data.longitude != null && data.locationSource === 'gps') {
      programmatic.current = true;
      map.current?.animateToRegion({ latitude: data.latitude, longitude: data.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400);
    }
  }, [data.latitude, data.longitude, data.locationSource]);

  return (
    <View style={{ flex: 1 }}>
      {nativeMapsAvailable ? (
        <View style={{ flex: 1, marginHorizontal: 16, borderRadius: 26, overflow: 'hidden' }}>
          <MapView
            ref={map}
            style={{ flex: 1 }}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
            initialRegion={initial}
            showsUserLocation
            userInterfaceStyle={isDark ? 'dark' : 'light'}
            customMapStyle={Platform.OS === 'android' && isDark ? darkMapStyle : undefined}
            onRegionChangeComplete={(r, details) => {
              if (programmatic.current) {
                programmatic.current = false;
              } else if (details?.isGesture !== false) {
                onPin(r);
              }
              onSettled(r.latitude, r.longitude);
            }}
          />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ marginBottom: 40, alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.warning, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="warning" size={18} color="#fff" />
              </View>
              <View style={{ width: 4, height: 18, backgroundColor: '#fff', borderRadius: 2 }} />
            </View>
          </View>
          <View style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
            <View style={{ backgroundColor: p.glass, borderRadius: 14, padding: 10 }}>
              <Text variant="caption">{t('report.adjustPin')}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View
          style={{ flex: 1, marginHorizontal: 16, borderRadius: 26, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}
        >
          <Ionicons name="navigate-circle-outline" size={48} color={p.cyan} />
          <Text center tone="muted">
            {t('map.noMapPin')}
          </Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Ionicons name="location" size={18} color={p.cyan} />
          <Text variant="caption" style={{ flex: 1 }} numberOfLines={2}>
            {[data.address, data.city].filter(Boolean).join(' · ') ||
              (data.latitude != null ? `${data.latitude.toFixed(5)}, ${data.longitude?.toFixed(5)}` : t('report.needLocation'))}
          </Text>
          <Pill label={data.locationSource === 'gps' ? t('report.gpsPin') : t('report.manualPin')} color={p.cyan} />
        </View>
        {data.locationSource === 'gps' && data.accuracy != null ? (
          <Text variant="caption" tone="muted">
            {t('report.gpsAccuracy', { value: Math.round(data.accuracy) })}
          </Text>
        ) : null}
        {error ? <Notice tone="warning" text={error} /> : null}

        {duplicates ? (
          <Animated.View entering={FadeInDown} style={{ gap: 10 }}>
            <Notice tone="warning" icon="copy-outline" text={`${t('report.duplicatesTitle')}. ${t('report.duplicatesBody')}`} />
            {duplicates.map((d) => (
              <Card key={d.id} onPress={() => router.push(`/hazard/${d.id}`)} style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <CategoryIcon category={d.category} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" weight="semibold">
                      {d.public_code} · {t(`categories.${d.category}`)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDistance(d.distance_m)} · {timeAgo(d.created_at)}
                    </Text>
                  </View>
                  <StatusBadge status={d.status} />
                </View>
              </Card>
            ))}
            <Button variant="secondary" label={t('report.notDuplicate')} onPress={onDismissDuplicates} />
          </Animated.View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button style={{ flex: 1 }} variant="secondary" icon="locate" label={t('report.useGps')} onPress={() => void onGps()} />
            <Button style={{ flex: 1 }} label={t('common.next')} onPress={onNext} disabled={data.latitude == null} />
          </View>
        )}
      </View>
    </View>
  );
}
