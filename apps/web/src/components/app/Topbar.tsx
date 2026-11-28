import Link from 'next/link';
import { Bell, Search, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { LanguageSwitcher, ThemeSwitcher } from '@/components/ui/client';
import { signOut } from '@/lib/actions/auth';
import type { Dict, Locale } from '@/lib/i18n/dict';
import { relative } from '@/lib/format';
import { OrgSwitcher } from './OrgSwitcher';

type Notification = { id: string; title_en: string; title_ar: string; body_en: string; body_ar: string; created_at: string; read_at: string | null };

export function Topbar({ t, locale, theme, sidebarToggle, orgs, currentOrg, user, roleLabel, notifications }: {
  t: Dict; locale: Locale; theme: 'light' | 'dark' | 'system'; sidebarToggle: React.ReactNode;
  orgs: { id: string; name: string; country: string; role: string }[]; currentOrg: string | null;
  user: { name: string; email: string }; roleLabel: string; notifications: Notification[];
}) {
  const unread = notifications.filter((n) => !n.read_at).length;
  const initials = (user.name || user.email).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b sm:gap-3 border-line bg-bg/85 pe-3 ps-16 backdrop-blur-xl sm:pe-6 lg:ps-6">
      {sidebarToggle}
      {currentOrg ? <OrgSwitcher orgs={orgs} current={currentOrg} label={t.topbar.switchOrg} addLabel={t.onboarding.create} /> : null}
      <form action="/app/search" className="relative ms-auto hidden max-w-md flex-1 md:block" role="search">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input name="q" className="input h-9 ps-9 pe-14 text-[13px]" placeholder={t.topbar.searchPlaceholder} aria-label={t.common.search} data-search-input />
        <kbd className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-3">{t.topbar.shortcut}</kbd>
      </form>
      <div className="ms-auto flex items-center gap-1.5 md:ms-0">
        <Link href="/app/search" className="btn btn-sm btn-ghost px-2 md:hidden" aria-label={t.common.search}><Search size={17} /></Link>
        <details className="relative">
          <summary className="btn btn-sm btn-ghost relative cursor-pointer list-none px-2 [&::-webkit-details-marker]:hidden" aria-label={t.topbar.notifications}>
            <Bell size={17} />
            {unread ? <span className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-crit px-1 text-[9.5px] font-[700] text-white">{unread}</span> : null}
          </summary>
          <div className="absolute end-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-raised shadow-float">
            <p className="border-b border-line px-4 py-3 text-[13px] font-[600]">{t.topbar.notifications}</p>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? <li className="px-4 py-8 text-center text-sm text-ink-2">{t.topbar.noNotifications}</li> : notifications.map((n) => (
                <li key={n.id} className="border-b border-line px-4 py-3 last:border-0">
                  <p className="text-[13px] font-[560]">{locale === 'ar' ? n.title_ar : n.title_en}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{locale === 'ar' ? n.body_ar : n.body_en}</p>
                  <p className="mt-1 text-[11px] text-ink-3">{relative(n.created_at, locale)}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>
        <span className="hidden sm:contents"><LanguageSwitcher locale={locale} compact /></span>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 hover:bg-hover [&::-webkit-details-marker]:hidden" aria-label={t.common.profile} data-testid="profile-menu">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-deep to-brand text-[12px] font-[650] text-white">{initials}</span>
          </summary>
          <div className="absolute end-0 z-40 mt-2 w-72 rounded-xl border border-line bg-raised p-1.5 shadow-float">
            <div className="px-3 py-2.5">
              <p className="truncate text-[13px] font-[600]">{user.name || user.email}</p>
              <p className="truncate text-xs text-ink-2">{user.email}</p>
              <p className="mt-1.5"><span className="badge bg-accent-soft text-accent-text">{roleLabel}</span></p>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-ink-2">{t.common.theme}</span>
              <ThemeSwitcher initial={theme} labels={{ light: t.common.light, dark: t.common.dark, system: t.common.system }} />
            </div>
            <div className="my-1 h-px bg-line" />
            <Link href="/app/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-hover"><SettingsIcon size={15} />{t.common.settings}</Link>
            <form action={signOut}><button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-crit-text hover:bg-crit-soft" data-testid="sign-out"><LogOut size={15} className="flip-rtl" />{t.common.signOut}</button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
