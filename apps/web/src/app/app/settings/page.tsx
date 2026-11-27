import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getAppDict, getTheme } from '@/lib/i18n/server';
import { Card, CardHeader, DefinitionList, PageHeader } from '@/components/ui';
import { LanguageSwitcher, ThemeSwitcher } from '@/components/ui/client';

export const metadata = { title: 'Settings' };

export default async function Settings() {
  const s = await getSession();
  if (!s) redirect('/sign-in');
  const { t, p, locale } = await getAppDict();
  const theme = await getTheme();
  return (
    <div className="max-w-3xl">
      <PageHeader title={p.settings.title} subtitle={p.settings.subtitle} />
      <div className="grid gap-5">
        <Card><CardHeader title={p.settings.account} />
          <DefinitionList items={[{ label: p.settings.name, value: s.profile?.full_name || '—' }, { label: p.org.email, value: s.user.email },
            ...s.memberships.map((m) => ({ label: m.name, value: t.roles[m.role] }))]} /></Card>
        <Card><CardHeader title={p.settings.locale} /><div className="flex items-center justify-between"><span className="text-sm text-ink-2">{locale === 'ar' ? 'العربية' : 'English'}</span><LanguageSwitcher locale={locale} /></div></Card>
        <Card><CardHeader title={p.settings.theme} /><ThemeSwitcher initial={theme} labels={{ light: t.common.light, dark: t.common.dark, system: t.common.system }} /></Card>
      </div>
    </div>
  );
}
