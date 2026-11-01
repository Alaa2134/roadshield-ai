import { Redirect, Stack } from 'expo-router';
import { isStaff, useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

/** UI guard only — task RPCs re-check assignment and role on the server. */
export default function OfficerLayout() {
  const role = useSession((s) => s.role);
  const session = useSession((s) => s.session);
  const { p } = useTheme();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!isStaff(role)) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />;
}
