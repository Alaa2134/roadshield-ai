import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { CategoryIcon, Pill } from '@/components/ui/Badges';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { DetectArt } from '@/components/illustrations';
import { useDrafts } from '@/hooks/data';
import { timeAgo } from '@/lib/format';
import { deleteDraft, type DraftStatus } from '@/lib/offline/drafts';
import { processQueue, useUploadProgress } from '@/lib/offline/sync';
import { useNetwork } from '@/stores/network';
import { useTheme } from '@/theme/ThemeProvider';

export default function ReportTab() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const { drafts } = useDrafts();
  const online = useNetwork((s) => s.online);
  const progress = useUploadProgress((s) => s.progress);

  const tone = (s: DraftStatus) => (s === 'failed' ? p.danger : s === 'queued' || s === 'uploading' ? p.warning : p.textMuted);

  return (
    <Screen title={t('report.title')} subtitle={t('report.photoTip')}>
      <Card variant="hero">
        <View style={{ alignItems: 'center', gap: 12 }}>
          <DetectArt size={170} />
          <Text variant="heading" center style={{ color: '#fff' }}>
            {t('onboarding.s2Title')}
          </Text>
          <Text variant="caption" center style={{ color: 'rgba(255,255,255,0.85)' }}>
            {t('report.aiTrainedOn')}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
            <Button size="lg" variant="warning" icon="camera" label={t('report.newReport')} onPress={() => router.push('/report/new')} />
          </View>
        </View>
      </Card>

      <Notice tone="warning" icon="car-outline" text={t('report.drivingWarning')} />

      <Section
        title={t('report.drafts')}
        action={
          drafts.some((d) => d.status === 'queued' || d.status === 'failed') && online ? (
            <Button size="sm" full={false} variant="secondary" icon="cloud-upload-outline" label={t('common.retry')} onPress={() => void processQueue(true)} />
          ) : undefined
        }
      >
        {drafts.length === 0 ? (
          <Text tone="muted">{t('report.noDrafts')}</Text>
        ) : (
          drafts.map((d) => {
            const locked = d.status === 'queued' || d.status === 'uploading';
            return (
              <Card key={d.id} style={{ padding: 14 }} onPress={locked ? undefined : () => router.push({ pathname: '/report/new', params: { draft: d.id } })}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {d.data.photos[0] ? (
                    <Image source={{ uri: d.data.photos[0].uri }} style={{ width: 56, height: 56, borderRadius: 14 }} contentFit="cover" />
                  ) : d.data.category ? (
                    <CategoryIcon category={d.data.category} size={56} />
                  ) : (
                    <Ionicons name="document-outline" size={30} color={p.textFaint} />
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text weight="semibold">{d.data.category ? t(`categories.${d.data.category}`) : t('report.newReport')}</Text>
                    <Text variant="caption" tone="muted">
                      {timeAgo(new Date(d.updatedAt).toISOString())}
                    </Text>
                    <Pill label={t(`report.draftStatus_${d.status}`)} color={tone(d.status)} />
                    {d.status === 'failed' && d.lastError ? (
                      <Text variant="caption" tone="danger">
                        {t(`errors.${d.lastError}`, { defaultValue: t('errors.generic') })}
                      </Text>
                    ) : null}
                    {progress?.draftId === d.id ? (
                      <Text variant="caption" tone="cyan">
                        {t('report.uploading', { current: progress.current, total: progress.total })} {Math.round(progress.fraction * 100)}%
                      </Text>
                    ) : null}
                  </View>
                  {!locked ? (
                    <IconButton
                      icon="trash-outline"
                      label={t('report.deleteDraft')}
                      size={38}
                      onPress={() =>
                        Alert.alert(t('report.deleteDraft'), undefined, [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => void deleteDraft(d.id) },
                        ])
                      }
                    />
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </Section>
    </Screen>
  );
}
