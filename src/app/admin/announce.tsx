import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Notice, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { sendAnnouncement } from '@/lib/api/staff';
import { errorMessage } from '@/lib/errors';

export default function Announce() {
  const { t } = useTranslation();
  const [f, setF] = useState({ titleEn: '', bodyEn: '', titleAr: '', bodyAr: '' });
  const valid = Object.values(f).every((v) => v.trim().length > 0);

  const send = useMutation({
    mutationFn: () => sendAnnouncement(f.titleEn, f.bodyEn, f.titleAr, f.bodyAr),
    onSuccess: (count) => {
      toast.success(t('admin.sent', { count }));
      setF({ titleEn: '', bodyEn: '', titleAr: '', bodyAr: '' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Screen back title={t('admin.announce')} keyboard>
      <Notice tone="info" text={t('prefs.announcements')} />
      <Input label={t('admin.announceTitleEn')} value={f.titleEn} maxLength={120} onChangeText={(v) => setF({ ...f, titleEn: v })} />
      <Input label={t('admin.announceBodyEn')} value={f.bodyEn} maxLength={500} multiline onChangeText={(v) => setF({ ...f, bodyEn: v })} />
      <Input label={t('admin.announceTitleAr')} value={f.titleAr} maxLength={120} onChangeText={(v) => setF({ ...f, titleAr: v })} style={{ textAlign: 'right', writingDirection: 'rtl' }} />
      <Input label={t('admin.announceBodyAr')} value={f.bodyAr} maxLength={500} multiline onChangeText={(v) => setF({ ...f, bodyAr: v })} style={{ textAlign: 'right', writingDirection: 'rtl' }} />
      <Button
        size="lg"
        icon="megaphone"
        label={t('admin.send')}
        disabled={!valid}
        loading={send.isPending}
        onPress={() =>
          Alert.alert(t('admin.send'), f.titleEn, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.confirm'), onPress: () => send.mutate() },
          ])
        }
      />
    </Screen>
  );
}
