import type { Metadata } from 'next';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';
import { ContactPage } from '@/components/marketing/ContactPage';

export async function generateMetadata(): Promise<Metadata> {
  const c = marketing[await getLocale()].contact;
  return { title: c.demoTitle, description: c.demoLead };
}

export default async function Page() {
  return <ContactPage locale={await getLocale()} kind="demo" />;
}
