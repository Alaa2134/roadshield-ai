'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

export type ImportBatch = { org: string; features: unknown[]; source: string; license: string; retrievedAt: string; city?: string; region?: string };
export async function importRoadBatch(b: ImportBatch): Promise<{ ok: boolean; error?: string; inserted?: number; updated?: number; skipped?: number }> {
  if (!/^[0-9a-f-]{36}$/i.test(b.org) || !Array.isArray(b.features) || b.features.length > 1000) return { ok: false, error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('import_road_segments', { p_org: b.org, p_features: b.features, p_source: b.source, p_license: b.license,
    p_retrieved_at: new Date(b.retrievedAt).toISOString(), p_city: b.city || null, p_region: b.region || null });
  if (error) return { ok: false, error: /^[A-Z_]+$/.test(error.message) ? error.message : 'generic' };
  revalidatePath('/app', 'layout');
  return { ok: true, ...(data as { inserted: number; updated: number; skipped: number }) };
}
