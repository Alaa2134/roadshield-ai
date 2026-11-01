import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * iOS always has Apple Maps. Android's Google Maps SDK crashes on start without an API key, so
 * builds made without GOOGLE_MAPS_ANDROID_API_KEY render a list view instead of a map
 * (app.config.ts records whether the key was present at build time).
 */
export const nativeMapsAvailable: boolean =
  Platform.OS !== 'android' ||
  !!(Constants.expoConfig?.extra as { androidMapsConfigured?: boolean } | undefined)?.androidMapsConfigured;
