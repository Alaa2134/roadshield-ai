import type { Metadata } from 'next';
import { FeaturePageView } from '@/components/marketing/FeaturePageView';
import { getLocale } from '@/lib/i18n/server';
import { marketing } from '@/lib/i18n/marketing';

export async function generateMetadata(): Promise<Metadata> {
  const p = marketing[await getLocale()].pages['solutions']!;
  return { title: p.title, description: p.lead, openGraph: { title: p.title, description: p.lead } };
}

export default async function Page() {
  return <FeaturePageView locale={await getLocale()} pageKey="solutions" />;
}
