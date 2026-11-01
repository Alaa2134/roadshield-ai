import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '@/lib/haptics';
import type { RouteAssessment } from '@/lib/routing';
import { nextWarning, shouldAnnounce, type ActiveWarning } from '@/lib/warnings';
import { useSettings } from '@/stores/settings';

export type { ActiveWarning };

/**
 * Foreground hazard warnings while a route is being followed with this screen open.
 * Warns only for verified hazards AHEAD on the selected route within the user's configured
 * distance, at most once per hazard per 10 minutes, with optional spoken alerts.
 */
export function useHazardWarnings(route: RouteAssessment | null, enabled: boolean) {
  const { t, i18n } = useTranslation();
  const distance = useSettings((s) => s.warningDistanceM);
  const voice = useSettings((s) => s.voiceWarnings);
  const [warning, setWarning] = useState<ActiveWarning | null>(null);
  const warned = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled || !route) {
      setWarning(null);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 3000 },
      (fix) => {
        const here = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
        const ahead = nextWarning(here, route, distance);
        setWarning(ahead);
        if (!ahead || !shouldAnnounce(ahead.hazard.id, warned.current)) return;
        haptic.warning();
        if (voice) {
          Speech.speak(
            t('warnings.voice', {
              category: t(`categories.${ahead.hazard.category}`),
              distance: Math.round(ahead.distanceM / 10) * 10,
            }),
            { language: i18n.language === 'ar' ? 'ar' : 'en-US', rate: 1.0 },
          );
        }
      },
    ).then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    });
    return () => {
      cancelled = true;
      sub?.remove();
      void Speech.stop();
    };
  }, [enabled, route, distance, voice, t, i18n.language]);

  return warning;
}
