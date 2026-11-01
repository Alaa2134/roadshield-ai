import { Redirect } from 'expo-router';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';

export default function Entry() {
  const onboardingDone = useSettings((s) => s.onboardingDone);
  const session = useSession((s) => s.session);
  const recovering = useSession((s) => s.recovering);
  if (!onboardingDone) return <Redirect href="/onboarding" />;
  if (recovering) return <Redirect href="/(auth)/reset-password" />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(tabs)" />;
}
