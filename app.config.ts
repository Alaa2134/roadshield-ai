import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * RoadShield AI — dynamic Expo config.
 *
 * Identity values can be overridden per environment (see .env.example and eas.json):
 *   APP_BUNDLE_ID          iOS bundle identifier and Android application id
 *   EAS_PROJECT_ID         written by `eas init` / `eas build:configure`
 *   GOOGLE_MAPS_ANDROID_API_KEY  required for Google Maps tiles on Android release builds
 *   GOOGLE_SERVICES_JSON   path to google-services.json (EAS "file" variable) for Android push;
 *                          a ./google-services.json in the project root is used if present
 *
 * Public runtime values (safe to ship in the app) use the EXPO_PUBLIC_ prefix and are read
 * in src/lib/env.ts. Privileged secrets never belong here.
 */
const BUNDLE_ID = process.env.APP_BUNDLE_ID ?? 'com.roadshieldai.app';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const ANDROID_MAPS_KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
const GOOGLE_SERVICES =
  process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RoadShield AI',
  slug: 'roadshield-ai',
  scheme: 'roadshield',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#070F1E',
  primaryColor: '#287BFF',
  description: 'Safer Roads. Smarter Cities. Report, verify and track road hazards.',
  runtimeVersion: { policy: 'appVersion' },
  updates: { enabled: false },
  ios: {
    bundleIdentifier: BUNDLE_ID,
    buildNumber: '1',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'RoadShield AI uses your location to pin hazard reports and show verified hazards near you.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'If you turn on background hazard alerts, RoadShield AI uses your location while the app is closed to warn you about verified hazards nearby. You can turn this off at any time in Settings.',
      NSCameraUsageDescription: 'RoadShield AI uses the camera to photograph road damage you want to report.',
      NSPhotoLibraryUsageDescription: 'RoadShield AI lets you attach existing photos of road damage to a report.',
      UIBackgroundModes: ['location', 'remote-notification'],
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ['en', 'ar'],
    },
  },
  android: {
    package: BUNDLE_ID,
    versionCode: 1,
    ...(GOOGLE_SERVICES ? { googleServicesFile: GOOGLE_SERVICES } : {}),
    adaptiveIcon: {
      backgroundColor: '#070F1E',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  web: { bundler: 'metro', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-localization', { supportsRTL: true }],
    'expo-secure-store',
    'expo-sqlite',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#070F1E',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#070F1E' },
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'RoadShield AI uses your location to pin hazard reports and show verified hazards near you.',
        locationAlwaysAndWhenInUsePermission:
          'If you turn on background hazard alerts, RoadShield AI uses your location while the app is closed to warn you about verified hazards nearby.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'RoadShield AI uses the camera to photograph road damage you want to report.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'RoadShield AI lets you attach existing photos of road damage to a report.',
        cameraPermission: 'RoadShield AI uses the camera to photograph road damage you want to report.',
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#287BFF',
        defaultChannel: 'default',
      },
    ],
    ['react-native-maps', ANDROID_MAPS_KEY ? { androidGoogleMapsApiKey: ANDROID_MAPS_KEY } : {}],
  ],
  experiments: { typedRoutes: false },
  extra: {
    supportsRTL: true,
    androidMapsConfigured: !!ANDROID_MAPS_KEY,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
  ...(EAS_PROJECT_ID ? { owner: process.env.EXPO_OWNER } : {}),
});
