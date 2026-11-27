import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type OrgRole = 'owner' | 'finance_manager' | 'road_engineer' | 'field_inspector' | 'contractor' | 'executive_viewer';
export type Membership = {
  org_id: string; name: string; name_ar: string | null; slug: string; role: OrgRole; country_code: string;
  default_currency: string; timezone: string; plan_code: string; contractor_id: string | null;
};

export const getSession = cache(async () => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: roleRow }, { data: orgs }] = await Promise.all([
    sb.from('profiles').select('id, full_name, avatar_path, locale').eq('id', user.id).maybeSingle(),
    sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    sb.rpc('my_organizations'),
  ]);
  const memberships = (orgs ?? []) as Membership[];
  const wanted = (await cookies()).get('rs_org')?.value;
  const current = memberships.find((m) => m.org_id === wanted) ?? memberships[0] ?? null;
  return {
    user: { id: user.id, email: user.email ?? '' },
    profile: profile as { id: string; full_name: string; avatar_path: string | null; locale: string } | null,
    isPlatformAdmin: (roleRow as { role?: string } | null)?.role === 'admin',
    memberships, current,
  };
});

/** For pages that require an organization. */
export async function requireOrg() {
  const s = await getSession();
  if (!s) redirect('/sign-in');
  if (!s.current) redirect('/app/onboarding');
  return { ...s, org: s.current };
}

export const can = {
  readFinance: (r: OrgRole) => r === 'owner' || r === 'finance_manager' || r === 'executive_viewer',
  financeOrEngineer: (r: OrgRole) => r === 'owner' || r === 'finance_manager' || r === 'road_engineer' || r === 'executive_viewer',
  approveFinance: (r: OrgRole) => r === 'owner' || r === 'finance_manager',
  engineer: (r: OrgRole) => r === 'owner' || r === 'road_engineer',
  inspect: (r: OrgRole) => r === 'owner' || r === 'road_engineer' || r === 'field_inspector',
  staff: (r: OrgRole) => r !== 'contractor',
  owner: (r: OrgRole) => r === 'owner',
};
