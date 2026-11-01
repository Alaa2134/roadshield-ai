import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Divider, Segmented, ToggleRow } from '@/components/ui/Controls';
import { Notice } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { startBackgroundAlerts, stopBackgroundAlerts } from '@/lib/background';
import { formatDistance } from '@/lib/format';
import { requestNotificationPermission } from '@/lib/notifications';
import { useSettings, WARNING_DISTANCES } from '@/stores/settings';

export default function WarningSettings() {
  const { t } = useTranslation();
  const distance = useSettings((s) => s.warningDistanceM);
  const setDistance = useSettings((s) => s.setWarningDistance);
  const voice = useSettings((s) => s.voiceWarnings);
  const setVoice = useSettings((s) => s.setVoiceWarnings);
  const background = useSettings((s) => s.backgroundAlerts);
  const setBackground = useSettings((s) => s.setBackgroundAlerts);
  const [message, setMessage] = useState<string | null>(null);

  const toggleBackground = async (on: boolean) => {
    setMessage(null);
    if (!on) {
      setBackground(false);
      await stopBackgroundAlerts();
      return;
    }
    await requestNotificationPermission();
    const result = await startBackgroundAlerts();
    if (result === 'started') setBackground(true);
    else {
      setBackground(false);
      setMessage(result === 'unsupported' ? t('warnings.notSupported') : t('warnings.backgroundDenied'));
    }
  };

  return (
    <Screen back title={t('warnings.settingsTitle')}>
      <Section title={t('warnings.distance')}>
        <Segmented<string>
          value={String(distance)}
          onChange={(v) => setDistance(Number(v))}
          options={WARNING_DISTANCES.map((d) => ({ value: String(d), label: formatDistance(d) }))}
        />
      </Section>
      <Card>
        <ToggleRow icon="volume-high-outline" title={t('warnings.voiceOn')} value={voice} onChange={setVoice} />
        <Divider />
        <ToggleRow icon="navigate-circle-outline" title={t('warnings.background')} subtitle={t('warnings.backgroundHelp')} value={background} onChange={(v) => void toggleBackground(v)} />
      </Card>
      {message ? <Notice tone="warning" text={message} /> : null}
      <Notice tone="info" text={t('route.disclaimer')} />
    </Screen>
  );
}
