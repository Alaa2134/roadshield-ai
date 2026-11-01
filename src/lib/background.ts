import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import i18n from 'i18next';
import { nearbyHazards } from './api/hazards';
import { bboxOf, haversine } from './geo';
import { initI18n } from './i18n';
import { notifyLocal } from './notifications';
import { cacheHazards, cachedHazardsInBBox, shouldWarn } from './offline/cache';

import type { HazardSummary } from './types';

/**
 * Optional background hazard alerts.
 *
 * Runs only after the user turns it on AND grants "Always" location. The OS decides how often
 * this task runs (iOS may pause it; Android shows a persistent notification while active), so
 * the app never promises real-time background warnings. Each hazard alerts at most once per
 * 30 minutes to avoid spam. Uses cached verified hazards when there is no connectivity.
 */
export const BACKGROUND_TASK = 'roadshield-background-hazard-alerts';
const COOLDOWN_MS = 30 * 60_000;

type PersistedSettings = { state?: { warningDistanceM?: number; backgroundAlerts?: boolean; language?: string | null } };

async function readSettings() {
  try {
    const raw = await AsyncStorage.getItem('roadshield-settings');
    const parsed = raw ? (JSON.parse(raw) as PersistedSettings) : {};
    return {
      enabled: !!parsed.state?.backgroundAlerts,
      distance: parsed.state?.warningDistanceM ?? 300,
      language: parsed.state?.language === 'ar' ? 'ar' : 'en',
    };
  } catch {
    return { enabled: false, distance: 300, language: 'en' };
  }
}

async function hazardsAround(lat: number, lng: number, radius: number): Promise<HazardSummary[]> {
  try {
    const fresh = await nearbyHazards(lat, lng, Math.max(radius * 3, 1000), 50);
    await cacheHazards(fresh);
    return fresh;
  } catch {
    return cachedHazardsInBBox(bboxOf([{ latitude: lat, longitude: lng }], Math.max(radius * 3, 1000)));
  }
}

if (!TaskManager.isTaskDefined(BACKGROUND_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const settings = await readSettings();
    if (!settings.enabled) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => undefined);
      return;
    }
    const last = data.locations[data.locations.length - 1]!;
    const here = { latitude: last.coords.latitude, longitude: last.coords.longitude };
    const hazards = await hazardsAround(here.latitude, here.longitude, settings.distance);
    const near = hazards
      .map((h) => ({ h, d: haversine(here, h) }))
      .filter((x) => x.d <= settings.distance)
      .sort((a, b) => a.d - b.d)[0];
    if (!near || !(await shouldWarn(near.h.id, COOLDOWN_MS))) return;
    initI18n(settings.language as 'en' | 'ar');
    const t = i18n.getFixedT(settings.language);
    const category = t(`categories.${near.h.category}`);
    await notifyLocal(
      t('warnings.banner', { category, distance: t('common.meters', { value: Math.round(near.d) }) }),
      t('route.disclaimer'),
      { hazard_id: near.h.id, type: 'nearby_hazard' },
    );
  });
}

export async function startBackgroundAlerts(): Promise<'started' | 'denied' | 'unsupported'> {
  if (!(await Location.isBackgroundLocationAvailableAsync())) return 'unsupported';
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return 'denied';
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) return 'started';
  await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 150,
    deferredUpdatesInterval: 60_000,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'RoadShield hazard alerts',
      notificationBody: 'Watching for verified hazards near you. Turn off in Settings.',
      notificationColor: '#287BFF',
    },
  });
  return 'started';
}

export async function stopBackgroundAlerts() {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
  }
}
