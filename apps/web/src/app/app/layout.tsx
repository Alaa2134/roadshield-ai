import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getDict, getTheme } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { Sidebar } from '@/components/app/Sidebar';
import { Topbar } from '@/components/app/Topbar';
import { navFor } from '@/components/app/nav';
import { OfflineBanner } from '@/components/ui/client';
import { SearchShortcut } from '@/components/app/SearchShortcut';

export const metadata: Metadata = { title: { default: 'RoadShield OS', template: '%s · RoadShield OS' }, robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const { t, locale } = await getDict();
  const theme = await getTheme();
  const sb = await supabaseServer();
  const { data: notifications } = await sb.from('notifications')
    .select('id, title_en, title_ar, body_en, body_ar, created_at, read_at').order('created_at', { ascending: false }).limit(8);
  const role = session.current?.role ?? null;
  const groups = navFor(role).map((g) => ({ ...g, items: g.items.filter((i) => i.key !== 'modelCenter' || role || session.isPlatformAdmin) }));
  const orgName = session.current ? (locale === 'ar' && session.current.name_ar ? session.current.name_ar : session.current.name) : t.brand.os;
  return (
    <div className="min-h-dvh bg-bg">
      <Sidebar groups={session.current ? groups : []} labels={t.nav as unknown as Record<string, string>} groupLabels={t.nav.groups}
        orgName={orgName} planLabel={session.current ? `${session.current.plan_code.toUpperCase()} · ${session.current.default_currency}` : ''} />
      <div className="lg:ps-[248px]">
        <OfflineBanner text={t.errors.offline} />
        <Topbar t={t} locale={locale} theme={theme}
          sidebarToggle={<span className="lg:hidden" />}
          orgs={session.memberships.map((m) => ({ id: m.org_id, name: m.name, country: m.country_code, role: t.roles[m.role] }))}
          currentOrg={session.current?.org_id ?? null}
          user={{ name: session.profile?.full_name ?? '', email: session.user.email }}
          roleLabel={session.isPlatformAdmin ? t.roles.admin : role ? t.roles[role] : t.roles.citizen}
          notifications={(notifications ?? []) as never} />
        <main id="main" className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <SearchShortcut />
    </div>
  );
}
