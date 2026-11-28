import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { isStaff, useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Native tab bar.
 *  - iOS: UITabBarController. On iOS 26+ the system renders it in Liquid Glass and it minimises
 *    on scroll; on earlier versions it is the standard translucent tab bar. Icons are SF Symbols.
 *  - Android: Material 3 bottom navigation with Material Symbols icons.
 * A hidden tab cannot be navigated to, so each role's hidden tabs are never linked for that
 * role (staff open their own reports at /my-reports; Field mode is the /field stack).
 * At most five tabs are visible for any role.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { p } = useTheme();
  const session = useSession((s) => s.session);
  const role = useSession((s) => s.role);
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  const staff = isStaff(role);
  const admin = role === 'admin';

  return (
    <NativeTabs tintColor={p.primary} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
        <NativeTabs.Trigger.Label>{t('tabs.map')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="report" hidden={admin}>
        <NativeTabs.Trigger.Icon sf="viewfinder" md="center_focus_strong" />
        <NativeTabs.Trigger.Label>{t('tabs.scan')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports" hidden={staff}>
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="description" />
        <NativeTabs.Trigger.Label>{t('tabs.reports')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="work" hidden={!staff}>
        <NativeTabs.Trigger.Icon sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }} md="construction" />
        <NativeTabs.Trigger.Label>{t('tabs.work')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="admin" hidden={!admin}>
        <NativeTabs.Trigger.Icon sf="gauge.with.dots.needle.67percent" md="speed" />
        <NativeTabs.Trigger.Label>{t('tabs.admin')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
