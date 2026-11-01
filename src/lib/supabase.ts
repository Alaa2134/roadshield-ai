import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { env } from './env';
import { chunkedSecureStorage } from './secureStorage';

/**
 * Single Supabase client for the app. Uses the publishable key only; every privileged action
 * is enforced server-side by RLS and SECURITY DEFINER functions that re-check the caller's role.
 */
export const supabase = createClient(env.supabaseUrl || 'https://invalid.local', env.supabaseKey || 'missing', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : chunkedSecureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: { headers: { 'x-client-info': 'roadshield-mobile/1.0.0' } },
});

// Refresh tokens only while the app is in the foreground (recommended for React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

export const HAZARD_BUCKET = 'hazard-images';
export const AVATAR_BUCKET = 'avatars';
