import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, View, type ColorValue } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { isStaff, useSession } from '@/stores/session';
import type { IconName } from '@/components/ui/Button';

function TabIcon({ name, color, focused, center }: { name: IconName; color: ColorValue; focused: boolean; center?: boolean }) {
  const { p } = useTheme();
  if (center) {
    return (
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          marginTop: -18,
          backgroundColor: p.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 4,
          borderColor: p.bg,
          shadowColor: p.primary,
          shadowOpacity: 0.55,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </View>
    );
  }
  return <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={23} color={(color ?? undefined) as string | undefined} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { p, isDark, font } = useTheme();
  const session = useSession((s) => s.session);
  const role = useSession((s) => s.role);
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  const staff = isStaff(role);
  const admin = role === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.cyan,
        tabBarInactiveTintColor: p.textFaint,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: p.border,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : p.surface,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 6,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView tint={isDark ? 'dark' : 'light'} intensity={80} style={{ flex: 1 }} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: (s) => <TabIcon name="home" {...s} /> }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: t('tabs.map'), tabBarIcon: (s) => <TabIcon name="map" {...s} /> }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: t('tabs.report'),
          href: admin ? null : '/(tabs)/report',
          tabBarIcon: (s) => <TabIcon name="add" center {...s} />,
          tabBarAccessibilityLabel: t('home.quickReport'),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('tabs.reports'),
          href: staff ? null : '/(tabs)/reports',
          tabBarIcon: (s) => <TabIcon name="document-text" {...s} />,
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: t('tabs.work'),
          href: staff ? '/(tabs)/work' : null,
          tabBarIcon: (s) => <TabIcon name="construct" {...s} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t('tabs.admin'),
          href: admin ? '/(tabs)/admin' : null,
          tabBarIcon: (s) => <TabIcon name="speedometer" {...s} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: (s) => <TabIcon name="person-circle" {...s} /> }}
      />
    </Tabs>
  );
}
