import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const session = useSession((s) => s.session);
  const recovering = useSession((s) => s.recovering);
  const { p } = useTheme();
  if (session && !recovering) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />;
}
