import 'server-only';
import { cookies, headers } from 'next/headers';
import { dictionaries, type Locale } from './dict';

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get('rs_locale')?.value;
  if (c === 'ar' || c === 'en') return c;
  const accept = (await headers()).get('accept-language') ?? '';
  return /^ar\b/i.test(accept.trim()) ? 'ar' : 'en';
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}

export async function getTheme(): Promise<'light' | 'dark' | 'system'> {
  const v = (await cookies()).get('rs_theme')?.value;
  return v === 'light' || v === 'dark' ? v : 'system';
}

export async function getAppDict() {
  const { pages } = await import('./pages');
  const { locale, t } = await getDict();
  return { locale, t, p: pages[locale] };
}
