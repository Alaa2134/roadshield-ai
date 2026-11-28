import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

/** UI guard only — every field RPC re-checks the caller's organization role on the server. */
export default function FieldLayout() {
  const session = useSession((s) => s.session);
  const { p } = useTheme();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />;
}
