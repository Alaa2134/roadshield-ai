import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { avatarUrl } from '@/lib/api/profile';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function Avatar({ path, name, size = 72 }: { path: string | null | undefined; name: string; size?: number }) {
  const { p } = useTheme();
  const url = useQuery({ queryKey: ['avatar', path], enabled: !!path, queryFn: () => avatarUrl(path ?? null), staleTime: 50 * 60_000 });
  const initials = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
  return url.data ? (
    <Image source={{ uri: url.data }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" accessibilityIgnoresInvertColors />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: p.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="title" style={{ color: '#fff' }}>
        {initials}
      </Text>
    </View>
  );
}
