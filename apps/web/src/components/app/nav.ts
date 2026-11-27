import type { OrgRole } from '@/lib/session';
import type { Dict } from '@/lib/i18n/dict';

export type NavItem = { href: string; key: keyof Dict['nav']; icon: string; roles?: OrgRole[]; adminOnly?: boolean };
export type NavGroup = { key: keyof Dict['nav']['groups']; items: NavItem[] };

const FIN: OrgRole[] = ['owner', 'finance_manager', 'executive_viewer'];
const FIN_ENG: OrgRole[] = ['owner', 'finance_manager', 'road_engineer', 'executive_viewer'];
const STAFF: OrgRole[] = ['owner', 'finance_manager', 'road_engineer', 'field_inspector', 'executive_viewer'];

export const NAV: NavGroup[] = [
  { key: 'operate', items: [{ href: '/app', key: 'overview', icon: 'layout' }] },
  { key: 'network', items: [
    { href: '/app/roads', key: 'roadNetwork', icon: 'route', roles: STAFF },
    { href: '/app/map', key: 'map', icon: 'map', roles: STAFF },
    { href: '/app/inspections', key: 'inspections', icon: 'scan', roles: STAFF },
    { href: '/app/reports', key: 'reports', icon: 'alert', roles: STAFF },
    { href: '/app/assets', key: 'assets', icon: 'box', roles: STAFF },
  ] },
  { key: 'delivery', items: [
    { href: '/app/projects', key: 'projects', icon: 'folder' },
    { href: '/app/work-orders', key: 'workOrders', icon: 'clipboard' },
    { href: '/app/contractors', key: 'contractors', icon: 'hardhat', roles: STAFF },
  ] },
  { key: 'finance', items: [
    { href: '/app/finance', key: 'finance', icon: 'wallet', roles: FIN },
    { href: '/app/procurement', key: 'procurement', icon: 'file', roles: [...FIN_ENG, 'contractor'] },
    { href: '/app/predictions', key: 'predictions', icon: 'trending', roles: FIN_ENG },
    { href: '/app/budget-studio', key: 'budgetStudio', icon: 'sliders', roles: FIN },
  ] },
  { key: 'intelligence', items: [
    { href: '/app/predictive', key: 'predictive', icon: 'activity', roles: STAFF },
    { href: '/app/analytics', key: 'analytics', icon: 'chart', roles: STAFF },
    { href: '/app/exports', key: 'exports', icon: 'download', roles: FIN_ENG },
    { href: '/app/model-center', key: 'modelCenter', icon: 'cpu' },
  ] },
  { key: 'admin', items: [
    { href: '/app/organization', key: 'organization', icon: 'building', roles: ['owner', 'executive_viewer', 'finance_manager', 'road_engineer'] },
    { href: '/app/organization/members', key: 'users', icon: 'users', roles: ['owner'] },
    { href: '/app/settings', key: 'settings', icon: 'settings' },
  ] },
];

export function navFor(role: OrgRole | null) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || (role && i.roles.includes(role))) })).filter((g) => g.items.length);
}
