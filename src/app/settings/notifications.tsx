import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Divider, Segmented, ToggleRow } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Feedback';
import { Screen, Section } from '@/components/ui/Screen';
import { updateProfile, type ProfilePatch } from '@/lib/api/profile';
import { errorMessage } from '@/lib/errors';
import { formatDistance } from '@/lib/format';
import { useSession } from '@/stores/session';

const RADII = ['500', '1000', '2000', '5000'] as const;

export default function NotificationPrefs() {
  const { t } = useTranslation();
  const uid = useSession((s) => s.session?.user.id);
  const profile = useSession((s) => s.profile);
  const setProfile = useSession((s) => s.setProfile);

  // Server-side preferences: the push dispatcher reads these before sending.
  const save = async (patch: ProfilePatch) => {
    if (!uid || !profile) return;
    const previous = profile;
    setProfile({ ...profile, ...patch });
    try {
      setProfile(await updateProfile(uid, patch));
    } catch (e) {
      setProfile(previous);
      toast.error(errorMessage(e));
    }
  };

  if (!profile) return <Screen back title={t('profile.notificationPrefs')}>{null}</Screen>;

  return (
    <Screen back title={t('profile.notificationPrefs')}>
      <Card>
        <ToggleRow icon="git-commit-outline" title={t('prefs.statusUpdates')} value={profile.notify_status_updates} onChange={(v) => void save({ notify_status_updates: v })} />
        <Divider />
        <ToggleRow icon="warning-outline" title={t('prefs.nearby')} value={profile.notify_nearby} onChange={(v) => void save({ notify_nearby: v })} />
        <Divider />
        <ToggleRow icon="megaphone-outline" title={t('prefs.announcements')} value={profile.notify_announcements} onChange={(v) => void save({ notify_announcements: v })} />
      </Card>
      <Section title={t('prefs.radius')}>
        <View style={{ opacity: profile.notify_nearby ? 1 : 0.5 }}>
          <Segmented<(typeof RADII)[number]>
            value={(RADII.find((r) => Number(r) === profile.nearby_radius_m) ?? '1000') as (typeof RADII)[number]}
            onChange={(v) => void save({ nearby_radius_m: Number(v) })}
            options={RADII.map((r) => ({ value: r, label: formatDistance(Number(r)) }))}
          />
        </View>
      </Section>
    </Screen>
  );
}
