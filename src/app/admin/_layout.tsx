import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

/** UI guard only — every admin RPC re-checks the role on the server. */
export default function AdminLayout() {
  const role = useSession((s) => s.role);
  const session = useSession((s) => s.session);
  const { p } = useTheme();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (role !== 'admin') return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />;
}
