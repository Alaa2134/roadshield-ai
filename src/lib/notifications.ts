import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from './api/profile';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Report updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#287BFF',
  });
  await Notifications.setNotificationChannelAsync('hazard-alerts', {
    name: 'Hazard alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#FF9B35',
  });
}

export type PushState = 'granted' | 'denied' | 'undetermined' | 'unsupported' | 'not_configured';

export async function notificationPermission(): Promise<PushState> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function requestNotificationPermission(): Promise<PushState> {
  if (!Device.isDevice) return 'unsupported';
  await ensureChannels();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

let currentToken: string | null = null;

/**
 * Registers this device's real Expo push token with the backend. Returns the honest state:
 * no token is invented when the build has no EAS project id or permission is missing.
 */
export async function registerForPush(): Promise<PushState> {
  const permission = await notificationPermission();
  if (permission !== 'granted') return permission;
  const id = projectId();
  if (!id) return 'not_configured';
  await ensureChannels();
  let token: string;
  try {
    // Android builds need Firebase Cloud Messaging configured (google-services.json + FCM V1
    // key on EAS); without it no real token exists, so report "not configured" honestly.
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch {
    return 'not_configured';
  }
  currentToken = token;
  await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android', Device.deviceName ?? null);
  return 'granted';
}

export async function unregisterPush() {
  if (currentToken) {
    try {
      await unregisterPushToken(currentToken);
    } catch {
      // token row is also removed when the account is deleted
    }
    currentToken = null;
  }
}

/** Local notification (used by background hazard alerts; no server round-trip). */
export async function notifyLocal(title: string, body: string, data: Record<string, unknown>) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default', ...(Platform.OS === 'android' ? { channelId: 'hazard-alerts' } : {}) },
    trigger: null,
  });
}
