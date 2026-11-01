import * as Location from 'expo-location';
import { create } from 'zustand';
import type { LatLng } from './types';

type LocationState = {
  permission: 'unknown' | 'granted' | 'denied';
  position: (LatLng & { accuracy: number | null; heading: number | null; speed: number | null }) | null;
  city: string | null;
  updatedAt: number | null;
};

export const useLocationStore = create<LocationState>(() => ({
  permission: 'unknown',
  position: null,
  city: null,
  updatedAt: null,
}));

export async function checkLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  useLocationStore.setState({ permission: status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'unknown' });
  return status === 'granted';
}

/** Asks for "while in use" location only when a feature actually needs it. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  const granted = status === 'granted';
  useLocationStore.setState({ permission: granted ? 'granted' : 'denied' });
  return granted;
}

/**
 * Battery-friendly fix: reuse a recent last-known position when it is fresh and accurate
 * enough, otherwise take one balanced-accuracy reading.
 */
export async function getCurrentPosition(opts: { precise?: boolean; maxAgeMs?: number } = {}) {
  if (!(await checkLocationPermission())) return null;
  const maxAge = opts.maxAgeMs ?? 60_000;
  let fix = await Location.getLastKnownPositionAsync({ maxAge, requiredAccuracy: opts.precise ? 30 : 200 });
  if (!fix) {
    fix = await Location.getCurrentPositionAsync({
      accuracy: opts.precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
  }
  const position = {
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracy: fix.coords.accuracy ?? null,
    heading: fix.coords.heading ?? null,
    speed: fix.coords.speed ?? null,
  };
  useLocationStore.setState({ position, updatedAt: Date.now() });
  return position;
}

export async function reverseGeocode(point: LatLng): Promise<{ address: string | null; city: string | null }> {
  try {
    const [r] = await Location.reverseGeocodeAsync(point);
    if (!r) return { address: null, city: null };
    const city = r.city ?? r.subregion ?? r.region ?? null;
    const street = [r.street ?? r.name, r.district].filter(Boolean).join(', ');
    return { address: street || r.formattedAddress || null, city };
  } catch {
    return { address: null, city: null };
  }
}

export async function refreshCity(point: LatLng) {
  const { city } = await reverseGeocode(point);
  if (city) useLocationStore.setState({ city });
  return city;
}

export type PlaceResult = LatLng & { label: string };

/** Forward geocoding via the platform geocoder (Apple / Google Play services). */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = await Location.geocodeAsync(q);
  const out: PlaceResult[] = [];
  for (const r of results.slice(0, 5)) {
    const { address, city } = await reverseGeocode(r);
    out.push({ latitude: r.latitude, longitude: r.longitude, label: [address, city].filter(Boolean).join(' · ') || q });
  }
  return out;
}
