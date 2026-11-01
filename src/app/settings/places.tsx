import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { EmptyMapArt } from '@/components/illustrations';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/Controls';
import { EmptyState, Notice, toast } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { addSavedLocation, deleteSavedLocation, listSavedLocations } from '@/lib/api/profile';
import { errorMessage } from '@/lib/errors';
import { getCurrentPosition, requestLocationPermission, reverseGeocode } from '@/lib/location';
import { qk } from '@/lib/query';
import { useSession } from '@/stores/session';

export default function SavedPlaces() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  const places = useQuery({ queryKey: qk.savedPlaces, queryFn: listSavedLocations });
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('NOT_AUTHENTICATED');
      if (!(await requestLocationPermission())) throw new Error('locationDenied');
      const pos = await getCurrentPosition({ precise: true, maxAgeMs: 10_000 });
      if (!pos) throw new Error('locationDenied');
      const name = label.trim() || (await reverseGeocode(pos)).address || t('common.unknownPlace');
      await addSavedLocation(uid, name.slice(0, 60), pos.latitude, pos.longitude);
    },
    onSuccess: () => {
      setLabel('');
      setError(null);
      void client.invalidateQueries({ queryKey: qk.savedPlaces });
    },
    onError: (e) => setError(e.message === 'locationDenied' ? t('errors.locationDenied') : errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: deleteSavedLocation,
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.savedPlaces }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Screen back title={t('places.title')} keyboard>
      <Card>
        <View style={{ gap: 12 }}>
          <Input label={t('places.label')} placeholder={t('places.labelPh')} value={label} onChangeText={setLabel} maxLength={60} />
          {error ? <Notice tone="warning" text={error} /> : null}
          <Button icon="add-circle-outline" label={t('places.add')} onPress={() => add.mutate()} loading={add.isPending} />
        </View>
      </Card>
      {(places.data ?? []).length === 0 && !places.isLoading ? (
        <EmptyState illustration={<EmptyMapArt />} title={t('places.title')} body={t('places.empty')} />
      ) : (
        <Card>
          {(places.data ?? []).map((pl) => (
            <ListRow
              key={pl.id}
              icon="location-outline"
              title={pl.label}
              subtitle={`${pl.latitude.toFixed(4)}, ${pl.longitude.toFixed(4)}`}
              right={
                <IconButton
                  icon="trash-outline"
                  label={t('common.delete')}
                  size={36}
                  onPress={() =>
                    Alert.alert(pl.label, undefined, [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(pl.id) },
                    ])
                  }
                />
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
