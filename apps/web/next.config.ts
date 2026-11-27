import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const mapStyle = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron';
const origin = (u: string) => {
  try { return new URL(u).origin; } catch { return ''; }
};

// Content-Security-Policy: same-origin by default; Supabase, the map tile host and Google Fonts
// (self-hosted by next/font at build time) are the only third parties.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${origin(supabaseUrl)} https:`,
  "font-src 'self' data:",
  `connect-src 'self' ${origin(supabaseUrl)} ${origin(supabaseUrl).replace('https://', 'wss://')} ${origin(mapStyle)} https://tiles.openfreemap.org`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Road imports send up to a few MB of GeoJSON per batch.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
