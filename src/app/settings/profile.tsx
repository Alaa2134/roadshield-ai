import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { removeAvatar, updateProfile, uploadAvatar } from '@/lib/api/profile';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/stores/session';

export default function EditProfile() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  const profile = useSession((s) => s.profile);
  const refresh = useSession((s) => s.refreshProfile);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [city, setCity] = useState(profile?.home_city ?? '');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const nameError = name.trim().length < 2 || name.trim().length > 80 ? t('auth.v_name') : undefined;

  const save = async () => {
    if (!uid || nameError) return;
    setSaving(true);
    try {
      await updateProfile(uid, { full_name: name.trim(), home_city: city.trim() || null });
      await refresh();
      toast.success(t('common.saved'));
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async () => {
    if (!uid) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9, exif: false });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    try {
      const a = res.assets[0];
      await uploadAvatar(uid, a.uri, a.width, a.height);
      await refresh();
      void client.invalidateQueries({ queryKey: ['avatar'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Screen back title={t('profile.editProfile')} keyboard>
      <Card>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <Avatar path={profile?.avatar_path} name={name} size={96} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button full={false} size="sm" icon="camera-outline" label={t('profile.changePhoto')} onPress={changePhoto} loading={photoBusy} />
            {profile?.avatar_path ? (
              <Button
                full={false}
                size="sm"
                variant="secondary"
                label={t('profile.removePhoto')}
                onPress={async () => {
                  if (!uid) return;
                  await removeAvatar(uid, profile.avatar_path).catch((e) => toast.error(errorMessage(e)));
                  await refresh();
                }}
              />
            ) : null}
          </View>
        </View>
      </Card>
      <Input label={t('auth.fullName')} value={name} onChangeText={setName} maxLength={80} error={name ? nameError : undefined} />
      <Input label={`${t('profile.homeCity')} (${t('common.optional')})`} value={city} onChangeText={setCity} maxLength={80} icon="business-outline" />
      <Button size="lg" label={t('common.save')} onPress={save} loading={saving} disabled={!!nameError} />
    </Screen>
  );
}
