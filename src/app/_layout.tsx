import '../../global.css';
import '@/lib/background';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '@/components/ui/Feedback';
import { applyDirection, initI18n, reloadApp, resolveLanguage } from '@/lib/i18n';
import { registerForPush } from '@/lib/notifications';
import { recoverInterruptedUploads } from '@/lib/offline/drafts';
import { processQueue } from '@/lib/offline/sync';
import { queryClient } from '@/lib/query';
import { startNetworkMonitor } from '@/stores/network';
import { startSessionListener, useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 350, fade: true });

startSessionListener();
startNetworkMonitor(() => {
  void processQueue();
  void queryClient.invalidateQueries();
});

export { ErrorBoundary } from 'expo-router';

function AppStack() {
  const { p } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: p.bg },
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="report/new" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="report/success" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    Sora_600SemiBold,
    Sora_700Bold,
  });
  const hydrated = useSettings((s) => s.hydrated);
  const languagePref = useSettings((s) => s.language);
  const sessionReady = useSession((s) => s.ready);
  const session = useSession((s) => s.session);
  const [i18nReady, setI18nReady] = useState(false);

  // Language + layout direction (Arabic = RTL). A direction change needs one reload.
  useEffect(() => {
    if (!hydrated) return;
    const lang = resolveLanguage(languagePref);
    initI18n(lang);
    if (applyDirection(lang)) {
      void reloadApp();
      return;
    }
    setI18nReady(true);
  }, [hydrated, languagePref]);

  const ready = (fontsLoaded || !!fontError) && hydrated && i18nReady && sessionReady;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  // Upload queue + push registration once signed in.
  useEffect(() => {
    if (!session) return;
    void recoverInterruptedUploads().then(() => processQueue());
    void registerForPush().catch(() => undefined);
  }, [session]);

  // Open the related screen when a notification is tapped.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { hazard_id?: string; task_id?: string } | undefined;
      if (data?.task_id) router.push(`/officer/task/${data.task_id}`);
      else if (data?.hazard_id) router.push(`/hazard/${data.hazard_id}`);
      else router.push('/notifications');
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppStack />
            <ToastHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
