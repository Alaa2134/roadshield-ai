import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';
import { isNetworkError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      retry: (count, error) => !isNetworkError(error) && count < 2,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'online', retry: 0 },
  },
});

// TanStack Query pauses/resumes with real connectivity and refetches when the app is focused.
onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false));
  return () => sub.remove();
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

export const qk = {
  stats: ['my-stats'] as const,
  activity: ['my-activity'] as const,
  myReports: (uid: string) => ['my-reports', uid] as const,
  nearby: (lat: number, lng: number, r: number) => ['nearby', lat.toFixed(3), lng.toFixed(3), r] as const,
  hazard: (id: string) => ['hazard', id] as const,
  timeline: (id: string) => ['timeline', id] as const,
  images: (id: string) => ['hazard-images', id] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications-unread'] as const,
  savedPlaces: ['saved-places'] as const,
  queue: (scope: string, search: string, cat: string | null) => ['officer-queue', scope, search, cat] as const,
  task: (id: string) => ['task', id] as const,
  metrics: (days: number) => ['admin-metrics', days] as const,
  moderation: ['moderation'] as const,
  users: (search: string, role: string | null) => ['admin-users', search, role] as const,
  audit: ['audit'] as const,
  heatmap: ['heatmap'] as const,
};
