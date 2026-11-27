'use server';
import { supabaseServer } from '@/lib/supabase/server';
export async function searchRoadsAction(orgId: string, q: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || q.trim().length < 2) return [];
  const sb = await supabaseServer();
  const { data } = await sb.rpc('search_roads', { p_org: orgId, p_query: q.trim(), p_limit: 12 });
  return (data ?? []) as { id: string; name: string | null; highway_class: string; length_m: number }[];
}
