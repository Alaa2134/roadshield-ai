import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Sans_Arabic, Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import { getDict, getTheme } from '@/lib/i18n/server';
import { env } from '@/lib/env';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-barlow', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-plex-arabic', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getDict();
  const title = locale === 'ar' ? 'رود شيلد — من الحفرة حتى دفع ثمن إصلاحها' : 'RoadShield — from the pothole to the paid repair';
  const description = locale === 'ar'
    ? 'نظام صيانة الطرق للبلديات وهيئات الطرق: بلاغات بالصور، وفحص المهندسين، وميزانيات معتمدة، وشغل المقاولين، وكل دفعة في سجل واحد.'
    : 'Road maintenance system for municipalities and road authorities: photo reports, engineer inspections, approved budgets, contractor work and every payment in one record.';
  return {
    metadataBase: new URL(env.siteUrl),
    title: { default: title, template: '%s · RoadShield AI' },
    description,
    applicationName: 'RoadShield AI',
    icons: { icon: '/icon.svg' },
    openGraph: { type: 'website', siteName: 'RoadShield AI', title, description, locale: locale === 'ar' ? 'ar_EG' : 'en_US' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { languages: { en: '/', ar: '/' } },
  };
}

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F6F8FC' }, { media: '(prefers-color-scheme: dark)', color: '#060F1D' }],
  width: 'device-width', initialScale: 1,
};

// Runs before paint so the chosen/system theme never flashes.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )rs_theme=(light|dark|system)/);var t=m?m[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getDict();
  const theme = await getTheme();
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme={theme === 'dark' ? 'dark' : 'light'}
      className={`${inter.variable} ${plexArabic.variable} ${barlow.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
