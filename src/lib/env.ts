/**
 * Public runtime configuration. Values are inlined at build time from EXPO_PUBLIC_* variables
 * (see .env.example and eas.json). Nothing here is secret: the Supabase publishable key only
 * grants what Row Level Security allows.
 */
const trimSlash = (value: string | undefined) => (value ?? '').trim().replace(/\/+$/, '');

export const env = {
  supabaseUrl: trimSlash(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseKey: (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
  aiApiUrl: trimSlash(process.env.EXPO_PUBLIC_AI_API_URL),
  routingUrl: trimSlash(process.env.EXPO_PUBLIC_ROUTING_URL) || 'https://router.project-osrm.org',
  supportEmail: (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim(),
} as const;

export const isSupabaseConfigured = env.supabaseUrl.startsWith('https://') && env.supabaseKey.length > 20;
export const isAiConfigured = env.aiApiUrl.startsWith('http');

/** Initial demo area requested for the project: New Damietta, Egypt. */
export const DEMO_REGION = {
  latitude: 31.4368,
  longitude: 31.667,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
} as const;

export const AUTH_REDIRECT = 'roadshield://auth/callback';
