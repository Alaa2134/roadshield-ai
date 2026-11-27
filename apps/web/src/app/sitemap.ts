import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
const pages = ['', '/platform', '/vision', '/finance', '/predictive-maintenance', '/solutions', '/solutions/government',
  '/solutions/contractors', '/technology', '/security', '/pricing', '/about', '/contact', '/demo'];
export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((p) => ({ url: `${env.siteUrl}${p}`, changeFrequency: 'monthly', priority: p === '' ? 1 : 0.7 }));
}
