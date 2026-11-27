'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '../env';

let client: ReturnType<typeof createBrowserClient> | null = null;
export function supabaseBrowser() {
  client ??= createBrowserClient(env.supabaseUrl, env.supabaseKey);
  return client;
}
